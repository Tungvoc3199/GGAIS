import fs from 'node:fs';

const file = 'src/components/Students.tsx';
if (!fs.existsSync(file)) {
  throw new Error('[patch-dat-ledger] Students.tsx not found');
}
console.log('[patch-dat-ledger] DAT ledger patch hook ready.');
