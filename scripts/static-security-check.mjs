/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');

function checkRules() {
  console.log('=== STARTING STATIC SECURITY RULE CHECK ===');
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

  let anyFailed = false;

  for (const collection of collectionsToCheck) {
    const matchIndex = rulesContent.search(collection.matchPattern);
    if (matchIndex === -1) {
      console.error(`[FAIL] Không tìm thấy block match cho collection: ${collection.name}`);
      anyFailed = true;
      continue;
    }

    // Capture the block content after match up to the next closing brace
    const restOfContent = rulesContent.slice(matchIndex);
    const endBlockIndex = restOfContent.indexOf('}');
    if (endBlockIndex === -1) {
      console.error(`[FAIL] Block match cho ${collection.name} không hợp lệ (không đóng ngoặc).`);
      anyFailed = true;
      continue;
    }

    const blockContent = restOfContent.slice(0, endBlockIndex);
    
    // Check if contains "allow create, update, delete: if false;"
    const hasClientWriteLock = /allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+false\s*/.test(blockContent);
    if (hasClientWriteLock) {
      console.log(`[PASS] Collection ${collection.name} đã được khóa Client Writes hoàn toàn.`);
    } else {
      console.error(`[FAIL] Collection ${collection.name} THIẾU cấu hình khóa Client Writes: 'allow create, update, delete: if false;'`);
      anyFailed = true;
    }
  }

  if (anyFailed) {
    console.error('=== STATIC SECURITY RULE CHECK FAILED ===');
    process.exit(1);
  }

  console.log('=== STATIC SECURITY RULE CHECK PASSED ===');
}

checkRules();
