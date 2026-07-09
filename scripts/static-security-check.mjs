/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const RULES_PATH = path.join(ROOT, 'firestore.rules');
const SERVER_PATH = path.join(ROOT, 'server.ts');
const STUDENTS_PATH = path.join(ROOT, 'src/components/Students.tsx');
const AUTH_PATH = path.join(ROOT, 'src/components/Auth.tsx');
const APP_PATH = path.join(ROOT, 'src/App.tsx');
const SELF_PATH = 'scripts/static-security-check.mjs';

let anyFailed = false;

function fail(message) {
  console.error(`[FAIL] ${message}`);
  anyFailed = true;
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function listRepoFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const blockedDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (blockedDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listRepoFiles(fullPath, acc);
    } else {
      acc.push(fullPath);
    }
  }

  return acc;
}

function getBalancedMatchBlock(content, matchPattern) {
  const matchIndex = content.search(matchPattern);
  if (matchIndex === -1) return null;

  const fromMatch = content.slice(matchIndex);
  const firstBrace = fromMatch.indexOf('{');
  const blockStart = fromMatch.indexOf('{', firstBrace + 1);
  if (blockStart === -1) return null;

  let braceCount = 1;
  for (let i = blockStart + 1; i < fromMatch.length; i++) {
    if (fromMatch[i] === '{') braceCount++;
    if (fromMatch[i] === '}') braceCount--;
    if (braceCount === 0) return fromMatch.slice(blockStart, i);
  }

  return null;
}

function checkFirestoreRules() {
  if (!fs.existsSync(RULES_PATH)) {
    fail(`File firestore.rules không tồn tại tại: ${RULES_PATH}`);
    return;
  }

  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

  if (/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/.test(rulesContent)) {
    pass('firestore.rules có catch-all deny mặc định.');
  } else {
    fail('firestore.rules thiếu catch-all deny: allow read, write: if false.');
  }

  const collectionsToCheck = [
    { name: 'students', matchPattern: /match\s+\/students\/\{studentId\}/ },
    { name: 'lessons', matchPattern: /match\s+\/lessons\/\{lessonId\}/ },
    { name: 'payments', matchPattern: /match\s+\/payments\/\{paymentId\}/ },
    { name: 'paymentInstallmentLocks', matchPattern: /match\s+\/paymentInstallmentLocks\/\{lockId\}/ },
    { name: 'auditLogs', matchPattern: /match\s+\/auditLogs\/\{logId\}/ }
  ];

  for (const collection of collectionsToCheck) {
    const block = getBalancedMatchBlock(rulesContent, collection.matchPattern);
    if (!block) {
      fail(`Không tìm thấy hoặc không đọc được block match cho collection: ${collection.name}`);
      continue;
    }

    if (/allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+false\s*;/.test(block)) {
      pass(`Collection ${collection.name} đã được khóa Client Writes hoàn toàn.`);
    } else {
      fail(`Collection ${collection.name} thiếu cấu hình khóa Client Writes.`);
    }
  }
}

function checkServerPolicies() {
  if (!fs.existsSync(SERVER_PATH)) {
    warn('Không tìm thấy server.ts để kiểm tra các chính sách.');
    return;
  }

  const serverContent = fs.readFileSync(SERVER_PATH, 'utf8');
  const fallbackTruePattern = /function\s+checkRestWriteFallbackAllowed\s*\([^)]*\)\s*:\s*boolean\s*\{\s*return\s+true\s*;?\s*\}/;

  if (fallbackTruePattern.test(serverContent)) {
    fail('checkRestWriteFallbackAllowed đang cho phép bypass ghi REST tự do.');
  } else {
    pass('checkRestWriteFallbackAllowed có cấu hình bảo mật.');
  }

  const cancelEndpointIndex = serverContent.indexOf('/api/payments/cancel');
  if (cancelEndpointIndex === -1) {
    fail('Không tìm thấy endpoint /api/payments/cancel trong server.ts.');
  } else {
    const cancelScope = serverContent.slice(cancelEndpointIndex, cancelEndpointIndex + 500);
    if (cancelScope.includes('Accountant') || cancelScope.includes('["Admin", "Accountant"].includes(user.role)')) {
      fail('endpoint hủy hóa đơn /api/payments/cancel vẫn cho phép role Accountant truy cập.');
    } else {
      pass('endpoint hủy hóa đơn đã được bảo mật, không chứa Accountant trong scope kiểm tra.');
    }
  }

  if (/GEMINI_API_KEY\s*=\s*['"][^'"]+['"]/.test(serverContent)) {
    fail('server.ts có dấu hiệu hardcode GEMINI_API_KEY. Phải dùng process.env.GEMINI_API_KEY.');
  } else {
    pass('Không phát hiện hardcode GEMINI_API_KEY trong server.ts.');
  }
}

function checkFrontendGuards() {
  if (fs.existsSync(STUDENTS_PATH)) {
    const studentsContent = fs.readFileSync(STUDENTS_PATH, 'utf8');
    if (/useState\s*\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/.test(studentsContent)) {
      fail('Students.tsx chứa ngày sinh mặc định giả được hardcode.');
    } else {
      pass('Students.tsx không chứa ngày sinh mặc định giả hardcode.');
    }
  } else {
    warn('Không tìm thấy Students.tsx để kiểm tra DOB.');
  }

  if (fs.existsSync(AUTH_PATH)) {
    const authContent = fs.readFileSync(AUTH_PATH, 'utf8');

    if (authContent.includes('DefaultPassword123')) {
      fail('Auth.tsx còn chứa demo password dạng plain text DefaultPassword123.');
    } else {
      pass('Auth.tsx không còn chứa demo password dạng plain text.');
    }

    if (authContent.includes('env.PROD') && authContent.includes('!isProduction')) {
      pass('Auth.tsx có production guard cho Demo/Simulation UI.');
    } else {
      fail('Auth.tsx thiếu production guard cho Demo/Simulation UI.');
    }

    if (/toggleDatabaseMode\(true\)/.test(authContent) && !authContent.includes("showToggle && error.includes('auth/operation-not-allowed')")) {
      fail('Nút fallback Simulation khi lỗi auth chưa bị khóa bởi showToggle.');
    } else {
      pass('Fallback Simulation trong Auth.tsx bị khóa theo showToggle.');
    }
  } else {
    warn('Không tìm thấy Auth.tsx để kiểm tra Demo/Simulation.');
  }

  if (fs.existsSync(APP_PATH)) {
    const appContent = fs.readFileSync(APP_PATH, 'utf8');
    if (appContent.includes('authReady')) {
      pass('App.tsx có dùng authReady trong flow UI.');
    } else {
      fail('App.tsx không dùng authReady để kiểm soát trạng thái xác thực.');
    }
  }
}

function checkSecretsAndEnv() {
  const repoFiles = listRepoFiles(ROOT);
  const binaryPattern = /\.png$|\.jpe?g$|\.webp$|\.gif$|\.ico$|\.pdf$|\.mp4$|\.zip$/i;
  const secretPatterns = [
    { name: 'Firebase service account private key', pattern: /-----BEGIN PRIVATE KEY-----/ },
    { name: 'Supabase service role key assignment', pattern: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+/ },
    { name: 'Generic service role key assignment', pattern: /service[_-]?role[_-]?key\s*[:=]\s*['"][^'"]+/i },
    { name: 'Plain admin password assignment', pattern: /admin(password|_password)?\s*[:=]\s*['"][^'"]{3,}['"]/i }
  ];

  for (const file of repoFiles) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (rel === SELF_PATH || binaryPattern.test(rel)) continue;

    const content = readIfExists(file);
    for (const check of secretPatterns) {
      if (check.pattern.test(content)) {
        fail(`Phát hiện ${check.name} trong ${rel}.`);
      }
    }
  }

  const envFiles = repoFiles.filter(file => {
    const base = path.basename(file);
    return base.startsWith('.env') && base !== '.env.example';
  });

  const productionSecurityCheck = process.env.NODE_ENV === 'production' || process.env.CI === 'true' || process.env.VITE_PRODUCTION_SECURITY_CHECK === 'true';
  for (const file of envFiles) {
    const content = readIfExists(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (/VITE_ENABLE_DEMO_MODE\s*=\s*true/i.test(content)) {
      const msg = `${rel} đang bật VITE_ENABLE_DEMO_MODE=true.`;
      if (productionSecurityCheck) {
        fail(msg);
      } else {
        warn(`${msg} Cho phép ở local dev, nhưng Production/CI phải tắt.`);
      }
    }
  }
}

console.log('=== STARTING STATIC SECURITY RULE CHECK ===');
checkFirestoreRules();
checkServerPolicies();
checkFrontendGuards();
checkSecretsAndEnv();

if (anyFailed) {
  console.error('=== STATIC SECURITY RULE CHECK FAILED ===');
  process.exit(1);
}

console.log('=== STATIC SECURITY RULE CHECK PASSED ===');
