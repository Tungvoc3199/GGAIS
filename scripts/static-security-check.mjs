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
const MAIN_PATH = path.join(process.cwd(), 'src/main.tsx');

function checkRules() {
  console.log('=== STARTING STATIC SECURITY RULE CHECK ===');
  let anyFailed = false;

  if (!fs.existsSync(RULES_PATH)) {
    console.error(`[ERROR] File firestore.rules không tồn tại tại: ${RULES_PATH}`);
    process.exit(1);
  }

  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

  if (/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/.test(rulesContent)) {
    console.log('[PASS] firestore.rules có catch-all deny mặc định.');
  } else {
    console.error('[FAIL] firestore.rules thiếu catch-all deny mặc định.');
    anyFailed = true;
  }

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

    const fromMatchIndex = rulesContent.slice(matchIndex);
    const blockStartIdx = fromMatchIndex.indexOf('{', fromMatchIndex.indexOf('{') + 1);
    if (blockStartIdx === -1) {
      console.error(`[FAIL] Không tìm thấy opening brace cho block ${collection.name}`);
      anyFailed = true;
      continue;
    }

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
    const hasClientWriteLock = /allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+false\s*;/.test(blockContent);
    if (hasClientWriteLock) {
      console.log(`[PASS] Collection ${collection.name} đã được khóa Client Writes hoàn toàn.`);
    } else {
      console.error(`[FAIL] Collection ${collection.name} THIẾU cấu hình khóa Client Writes in block: ${blockContent}`);
      anyFailed = true;
    }
  }

  if (fs.existsSync(SERVER_PATH)) {
    const serverContent = fs.readFileSync(SERVER_PATH, 'utf8');
    const fallbackTruePattern = /function\s+checkRestWriteFallbackAllowed\s*\([^)]*\)\s*:\s*boolean\s*\{\s*return\s+true\s*;?\s*\}/;
    if (fallbackTruePattern.test(serverContent) || serverContent.includes("function checkRestWriteFallbackAllowed(res: any): boolean {\n  return true;\n}")) {
      console.error(`[FAIL] checkRestWriteFallbackAllowed đang cho phép bypass ghi REST tự do (return true).`);
      anyFailed = true;
    } else {
      console.log(`[PASS] checkRestWriteFallbackAllowed có cấu hình bảo mật.`);
    }

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

  if (fs.existsSync(STUDENTS_PATH)) {
    const studentsContent = fs.readFileSync(STUDENTS_PATH, 'utf8');
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

  if (fs.existsSync(AUTH_PATH)) {
    const authContent = fs.readFileSync(AUTH_PATH, 'utf8');
    if (authContent.includes('DefaultPassword123')) {
      console.error('[FAIL] Auth.tsx còn chứa demo password dạng plain text DefaultPassword123.');
      anyFailed = true;
    } else {
      console.log('[PASS] Auth.tsx không còn chứa demo password dạng plain text.');
    }

    if (authContent.includes('env.PROD') && authContent.includes('!isProduction')) {
      console.log('[PASS] Auth.tsx có production guard cho Demo/Simulation UI.');
    } else {
      console.error('[FAIL] Auth.tsx thiếu production guard cho Demo/Simulation UI.');
      anyFailed = true;
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

  if (fs.existsSync(MAIN_PATH)) {
    const mainContent = fs.readFileSync(MAIN_PATH, 'utf8');
    const hasBootstrapGuard = mainContent.includes('hardenAuthBootstrapStorage')
      && mainContent.includes("localStorage.removeItem('lhp_user')")
      && mainContent.includes("localStorage.setItem('lhp_use_local_simulation', 'false')")
      && mainContent.includes('canUseLocalSimulation');

    if (hasBootstrapGuard) {
      console.log('[PASS] main.tsx có auth bootstrap guard để xóa role cache không tin cậy.');
    } else {
      console.error('[FAIL] main.tsx thiếu auth bootstrap guard cho lhp_user/lhp_use_local_simulation.');
      anyFailed = true;
    }
  } else {
    console.warn(`[WARN] Không tìm thấy main.tsx để kiểm tra auth bootstrap guard.`);
  }

  if (anyFailed) {
    console.error('=== STATIC SECURITY RULE CHECK FAILED ===');
    process.exit(1);
  }

  console.log('=== STATIC SECURITY RULE CHECK PASSED ===');
}

checkRules();
