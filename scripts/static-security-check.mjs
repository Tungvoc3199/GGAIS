/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');
const SERVER_PATH = path.join(process.cwd(), 'server.ts');
const STUDENTS_PATH = path.join(process.cwd(), 'src/components/Students.tsx');

function checkRules() {
  console.log('=== STARTING STATIC SECURITY RULE CHECK ===');
  let anyFailed = false;

  // 1. Check firestore.rules
  if (!fs.existsSync(RULES_PATH)) {
    console.error(`[ERROR] File firestore.rules không tồn tại tại: ${RULES_PATH}`);
    process.exit(1);
  }

  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

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
    if (fallbackTruePattern.test(serverContent)) {
      console.error(`[FAIL] checkRestWriteFallbackAllowed đang cho phép bypass ghi REST tự do (return true).`);
      anyFailed = true;
    } else {
      console.log(`[PASS] checkRestWriteFallbackAllowed có cấu hình bảo mật.`);
    }

    // Check if /api/payments/cancel route contains Accountant wide-access check
    // e.g. ["Admin", "Accountant"].includes(user.role) inside the body or is not restricted strictly
    // Or specifically let's check for "Accountant" allowed in payments cancel
    const cancelEndpointIndex = serverContent.indexOf('/api/payments/cancel');
    if (cancelEndpointIndex !== -1) {
      const cancelScope = serverContent.slice(cancelEndpointIndex, cancelEndpointIndex + 500);
      if (cancelScope.includes('Accountant')) {
        console.error(`[FAIL] endpoint hủy hóa đơn /api/payments/cancel vẫn cho phép role Accountant truy cập.`);
        anyFailed = true;
      } else {
        console.log(`[PASS] endpoint hủy hóa đơn đã được bảo mật (không chứa Accountant).`);
      }
    } else {
      console.error(`[FAIL] Không tìm thấy endpoint /api/payments/cancel trong server.ts`);
      anyFailed = true;
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

  if (anyFailed) {
    console.error('=== STATIC SECURITY RULE CHECK FAILED ===');
    process.exit(1);
  }

  console.log('=== STATIC SECURITY RULE CHECK PASSED ===');
}

checkRules();
