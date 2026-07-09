/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');
const SERVER_PATH = path.join(process.cwd(), 'server.ts');
const STUDENTS_PATH = path.join(process.cwd(), 'src/components/Students.tsx');
const AUTH_PATH = path.join(process.cwd(), 'src/components/Auth.tsx');
const APP_PATH = path.join(process.cwd(), 'src/App.tsx');

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

function checkRules() {
  console.log('=== STARTING STATIC SECURITY RULE CHECK ===');
  let anyFailed = false;

  // 1. Check firestore.rules
  if (!fs.existsSync(RULES_PATH)) {
    console.error(`[ERROR] File firestore.rules không tồn tại tại: ${RULES_PATH}`);
    process.exit(1);
  }

  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

  if (!/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/.test(rulesContent)) {
    console.error('[FAIL] firestore.rules thiếu catch-all deny: allow read, write: if false.');
    anyFailed = true;
  } else {
    console.log('[PASS] firestore.rules có catch-all deny mặc định.');
  }

  // Let's check for the 5 collections
  const collectionsToCheck = [
    { name: 'students', matchPattern: /match\s+\/students\/\{studentId\}/ },
    { name: 'lessons', matchPattern: /match\s+\/lessons\/\{lessonId\}/ },
    { name: 'payments', matchPattern: /match\s+\/payments\/\{paymentId\}/ },
    { name: 'paymentInstallmentLocks', matchPattern: /match\s+\/paymentInstallmentLocks\/\{lockId\}/ },
    { name: 'auditLogs', matchPattern: /match\s+\/auditLogs\/\{logId\}/ }
  ];

  for (const collection of collectionsToCheck) {
    const matchIndex = rulesContent.search(collection.matchPattern);
    if (matchIndex === -1) {
      console.error(`[FAIL] Không tìm thấy block match cho collection: ${collection.name}`);
      anyFailed = true;
      continue;
    }

    // Capture the block content after match up to the next outer closing brace
    // To do this robustly without hitting the {studentId} closing brace:
    // We look for `{` after the match pattern.
    // However, `match /students/{studentId} {` has two opening braces: `{studentId}` and `{`.
    // Let's count matching braces to properly find the body of this match block!
    const fromMatchIndex = rulesContent.slice(matchIndex);
    // Find the opening brace '{' of the block itself (which is the one after {studentId})
    const blockStartIdx = fromMatchIndex.indexOf('{', fromMatchIndex.indexOf('{') + 1);
    if (blockStartIdx === -1) {
      console.error(`[FAIL] Không tìm thấy opening brace cho block ${collection.name}`);
      anyFailed = true;
      continue;
    }

    // Now balance braces starting from blockStartIdx
    let braceCount = 1;
    let endBlockIndex = -1;
    for (let i = blockStartIdx + 1; i < fromMatchIndex.length; i++) {
      if (fromMatchIndex[i] === '{') {
        braceCount++;
      } else if (fromMatchIndex[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endBlockIndex = i;
          break;
        }
      }
    }

    if (endBlockIndex === -1) {
      console.error(`[FAIL] Block match cho ${collection.name} không balanced.`);
      anyFailed = true;
      continue;
    }

    const blockContent = fromMatchIndex.slice(blockStartIdx, endBlockIndex);

    // Check if contains "allow create, update, delete: if false;"
    const hasClientWriteLock = /allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+false\s*;/.test(blockContent);
    if (hasClientWriteLock) {
      console.log(`[PASS] Collection ${collection.name} đã được khóa Client Writes hoàn toàn.`);
    } else {
      console.error(`[FAIL] Collection ${collection.name} THIẾU cấu hình khóa Client Writes in block: ${blockContent}`);
      anyFailed = true;
    }
  }

  // 2. Check checkRestWriteFallbackAllowed implementation in server.ts
  if (fs.existsSync(SERVER_PATH)) {
    const serverContent = fs.readFileSync(SERVER_PATH, 'utf8');

    // Check if checkRestWriteFallbackAllowed simply returns true
    const fallbackTruePattern = /function\s+checkRestWriteFallbackAllowed\s*\([^)]*\)\s*:\s*boolean\s*\{\s*return\s+true\s*;?\s*\}/;
    if (fallbackTruePattern.test(serverContent) || serverContent.includes("function checkRestWriteFallbackAllowed(res: any): boolean {\n  return true;\n}")) {
      console.error(`[FAIL] checkRestWriteFallbackAllowed đang cho phép bypass ghi REST tự do (return true).`);
      anyFailed = true;
    } else {
      console.log(`[PASS] checkRestWriteFallbackAllowed có cấu hình bảo mật.`);
    }

    // Check if /api/payments/cancel route contains Accountant wide-access check or the specific ["Admin", "Accountant"] list definition
    const cancelEndpointIndex = serverContent.indexOf('/api/payments/cancel');
    if (cancelEndpointIndex !== -1) {
      const cancelScope = serverContent.slice(cancelEndpointIndex, cancelEndpointIndex + 500);
      if (cancelScope.includes('Accountant') || cancelScope.includes('["Admin", "Accountant"].includes(user.role)')) {
        console.error(`[FAIL] endpoint hủy hóa đơn /api/payments/cancel vẫn cho phép role Accountant truy cập.`);
        anyFailed = true;
      } else {
        console.log(`[PASS] endpoint hủy hóa đơn đã được bảo mật (không chứa Accountant).`);
      }
    } else {
      console.error(`[FAIL] Không tìm thấy endpoint /api/payments/cancel trong server.ts`);
      anyFailed = true;
    }

    if (/GEMINI_API_KEY\s*=\s*['"][^'"]+['"]/.test(serverContent)) {
      console.error('[FAIL] server.ts có dấu hiệu hardcode GEMINI_API_KEY. Phải dùng process.env.GEMINI_API_KEY.');
      anyFailed = true;
    } else {
      console.log('[PASS] Không phát hiện hardcode GEMINI_API_KEY trong server.ts.');
    }
  } else {
    console.warn(`[WARN] Không tìm thấy server.ts để kiểm tra các chính sách.`);
  }

  // 3. Check hardcoded DOB in Students.tsx
  if (fs.existsSync(STUDENTS_PATH)) {
    const studentsContent = fs.readFileSync(STUDENTS_PATH, 'utf8');
    // Pattern finding useState('YYYY-MM-DD')
    const hardcodedDobPattern = /useState\s*\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/;
    if (hardcodedDobPattern.test(studentsContent)) {
      console.error(`[FAIL] Students.tsx chứa ngày sinh mặc định giả được hardcode.`);
      anyFailed = true;
    } else {
      console.log(`[PASS] Students.tsx không chứa ngày sinh mặc định giả hardcode.`);
    }
  } else {
    console.warn(`[WARN] Không tìm thấy Students.tsx để kiểm tra DOB.`);
  }

  // 4. Production demo controls in Auth.tsx
  if (fs.existsSync(AUTH_PATH)) {
    const authContent = fs.readFileSync(AUTH_PATH, 'utf8');
    if (authContent.includes('DefaultPassword123')) {
      console.error('[FAIL] Auth.tsx còn chứa demo password dạng plain text DefaultPassword123.');
      anyFailed = true;
    } else {
      console.log('[PASS] Auth.tsx không còn chứa demo password dạng plain text.');
    }

    if (!authContent.includes('env.PROD') || !authContent.includes('!isProduction')) {
      console.error('[FAIL] Auth.tsx thiếu production guard cho Demo/Simulation UI.');
      anyFailed = true;
    } else {
      console.log('[PASS] Auth.tsx có production guard cho Demo/Simulation UI.');
    }

    if (/toggleDatabaseMode\(true\)/.test(authContent) && !authContent.includes("showToggle && error.includes('auth/operation-not-allowed')")) {
      console.error('[FAIL] Nút fallback Simulation khi lỗi auth chưa bị khóa bởi showToggle.');
      anyFailed = true;
    } else {
      console.log('[PASS] Fallback Simulation trong Auth.tsx bị khóa theo showToggle.');
    }
  } else {
    console.warn(`[WARN] Không tìm thấy Auth.tsx để kiểm tra Demo/Simulation.`);
  }

  // 5. Session/auth gate sanity in App.tsx
  if (fs.existsSync(APP_PATH)) {
    const appContent = fs.readFileSync(APP_PATH, 'utf8');
    if (!appContent.includes('authReady')) {
      console.error('[FAIL] App.tsx không dùng authReady để kiểm soát trạng thái xác thực.');
      anyFailed = true;
    } else {
      console.log('[PASS] App.tsx có dùng authReady trong flow UI.');
    }
  }

  // 6. Secret and dangerous production env scan
  const repoFiles = listRepoFiles(process.cwd());
  const secretPatterns = [
    { name: 'Firebase service account private key', pattern: /-----BEGIN PRIVATE KEY-----/ },
    { name: 'Supabase service role key', pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=/ },
    { name: 'Generic service_role key', pattern: /service_role/i },
    { name: 'Plain admin password assignment', pattern: /admin(password|_password)?\s*[:=]\s*['"][^'"]{3,}['"]/i }
  ];

  for (const file of repoFiles) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    if (/\.png$|\.jpe?g$|\.webp$|\.gif$|\.ico$|\.pdf$|\.mp4$|\.zip$/i.test(rel)) continue;
    const content = readIfExists(file);
    for (const check of secretPatterns) {
      if (check.pattern.test(content)) {
        console.error(`[FAIL] Phát hiện ${check.name} trong ${rel}.`);
        anyFailed = true;
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
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    if (/VITE_ENABLE_DEMO_MODE\s*=\s*true/i.test(content)) {
      const msg = `[${productionSecurityCheck ? 'FAIL' : 'WARN'}] ${rel} đang bật VITE_ENABLE_DEMO_MODE=true.`;
      if (productionSecurityCheck) {
        console.error(msg);
        anyFailed = true;
      } else {
        console.warn(`${msg} Cho phép ở local dev, nhưng Production/CI phải tắt.`);
      }
    }
  }

  if (anyFailed) {
    console.error('=== STATIC SECURITY RULE CHECK FAILED ===');
    process.exit(1);
  }

  console.log('=== STATIC SECURITY RULE CHECK PASSED ===');
}

checkRules();
