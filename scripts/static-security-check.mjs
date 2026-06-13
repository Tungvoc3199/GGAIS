/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const FILES = {
  firestoreRules: path.join(ROOT, 'firestore.rules'),
  storageRules: path.join(ROOT, 'storage.rules'),
  server: path.join(ROOT, 'server.ts'),
  students: path.join(ROOT, 'src', 'components', 'Students.tsx')
};

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Thiếu file bắt buộc: ${path.relative(ROOT, filePath)}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Extract a Firestore match block by balancing braces.
 * The path contains placeholders such as {studentId}; therefore the body
 * opening brace must be taken from the end of the matched declaration.
 */
function extractBalancedMatchBlock(source, matchPattern, label) {
  const match = source.match(matchPattern);
  if (!match || match.index === undefined) {
    fail(`Không tìm thấy block match cho ${label}`);
    return '';
  }

  const start = match.index;
  const openingBrace = start + match[0].lastIndexOf('{');
  if (openingBrace < start) {
    fail(`Block match ${label} không có dấu mở ngoặc`);
    return '';
  }

  let depth = 0;
  for (let i = openingBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  fail(`Block match ${label} không đóng ngoặc hợp lệ`);
  return '';
}

function assertIncludes(source, pattern, successMessage, failureMessage) {
  if (pattern.test(source)) pass(successMessage);
  else fail(failureMessage);
}

console.log('=== STARTING STATIC SECURITY CHECK ===');

const firestoreRules = readRequired(FILES.firestoreRules);
const storageRules = readRequired(FILES.storageRules);
const server = readRequired(FILES.server);
const students = readRequired(FILES.students);

const lockedCollections = [
  ['students', /match\s+\/students\/\{studentId\}\s*\{/, 'students'],
  ['lessons', /match\s+\/lessons\/\{lessonId\}\s*\{/, 'lessons'],
  ['payments', /match\s+\/payments\/\{paymentId\}\s*\{/, 'payments'],
  ['paymentInstallmentLocks', /match\s+\/paymentInstallmentLocks\/\{lockId\}\s*\{/, 'paymentInstallmentLocks'],
  ['auditLogs', /match\s+\/auditLogs\/\{logId\}\s*\{/, 'auditLogs']
];

for (const [name, pattern, label] of lockedCollections) {
  const block = extractBalancedMatchBlock(firestoreRules, pattern, label);
  assertIncludes(
    block,
    /allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+false\s*;/,
    `Collection ${name} đã khóa client write`,
    `Collection ${name} chưa khóa đủ create, update, delete từ client`
  );
}

assertIncludes(
  server,
  /const\s+PORT\s*=\s*Number\(process\.env\.PORT\)\s*\|\|\s*3000\s*;/,
  'Backend dùng PORT từ environment',
  'Backend chưa dùng PORT từ environment'
);

assertIncludes(
  server,
  /app\.post\(\s*["']\/api\/ocr-card["']\s*,\s*checkAuth\s*,/,
  'OCR route dùng checkAuth',
  'OCR route chưa dùng checkAuth'
);

assertIncludes(
  storageRules,
  /\(kind\s*==\s*['"]cccd['"]\s*\|\|\s*kind\s*==\s*['"]eid['"]\)\s*&&\s*hasRole\(\[['"]Admin['"]\s*,\s*['"]Staff['"]\]\)/,
  'CCCD và EID chỉ cho Admin hoặc Staff đọc',
  'Storage Rules chưa khóa CCCD và EID theo role Admin hoặc Staff'
);

if (/useState\(\s*['"]1998-01-01['"]\s*\)/.test(students)) {
  fail('Form học viên vẫn còn ngày sinh mặc định giả 1998-01-01');
} else {
  pass('Form học viên không còn ngày sinh mặc định giả 1998-01-01');
}

if (/useState\(\s*['"]inst_2['"]\s*\)/.test(students) || /useState\(\s*['"]veh_1['"]\s*\)/.test(students)) {
  fail('Form học viên vẫn hardcode giáo viên hoặc xe mặc định');
} else {
  pass('Form học viên không còn hardcode giáo viên hoặc xe mặc định');
}

assertIncludes(
  students,
  /\^\((?:\?:)?03\|05\|07\|08\|09\)\\d\{8\}\$/,
  'Regex số điện thoại Việt Nam đã chuẩn hóa',
  'Regex số điện thoại Việt Nam chưa chuẩn hóa'
);

if (process.exitCode) {
  console.error('=== STATIC SECURITY CHECK FAILED ===');
  process.exit(process.exitCode);
}

console.log('=== STATIC SECURITY CHECK PASSED ===');
