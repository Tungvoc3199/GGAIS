import fs from 'node:fs';

const file = 'src/components/Dashboard.tsx';
const marker = 'OPERATIONAL_MONTH_CALENDAR_DASHBOARD_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-dashboard-operational-calendar] already patched');
  process.exit(0);
}

const importAnchor = "import { useDatabase } from '../context/DatabaseContext';\n";
const importLine = "import { OperationalMonthCalendar } from './OperationalMonthCalendar';\n";
if (!src.includes(importLine)) {
  if (!src.includes(importAnchor)) throw new Error('[patch-dashboard-operational-calendar] Missing import anchor');
  src = src.replace(importAnchor, importAnchor + importLine);
}

const insertAnchor = `      {/* MOBILE-ONLY TODAY'S LESSONS RENDERED FIRST */}\n`;
const calendarBlock = `      {/* ${marker} */}\n      <OperationalMonthCalendar\n        lessons={lessons}\n        students={students}\n        instructors={instructors}\n        vehicles={vehicles}\n      />\n\n`;
if (!src.includes(insertAnchor)) throw new Error('[patch-dashboard-operational-calendar] Missing mobile lessons anchor');
src = src.replace(insertAnchor, calendarBlock + insertAnchor);

src = src.replace('Xếp lịch tự động', 'Gợi ý xếp lịch');

fs.writeFileSync(file, src);
console.log('[patch-dashboard-operational-calendar] added operational month calendar to Dashboard');
