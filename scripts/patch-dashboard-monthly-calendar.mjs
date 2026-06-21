import fs from 'node:fs';

const file = 'src/components/Dashboard.tsx';
const marker = 'DASHBOARD_MONTHLY_OPERATIONAL_CALENDAR_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-dashboard-monthly-calendar] already patched');
  process.exit(0);
}

if (!src.includes("import { MonthlyOperationalCalendar } from './MonthlyOperationalCalendar';")) {
  src = src.replace(
    "import { checkLessonConflicts } from '../services/scheduling';\n",
    "import { checkLessonConflicts } from '../services/scheduling';\nimport { MonthlyOperationalCalendar } from './MonthlyOperationalCalendar';\n"
  );
}

const anchor = `      {/* MOBILE-ONLY TODAY'S LESSONS RENDERED FIRST */}\n`;
const block = `      {/* ${marker} */}\n      <MonthlyOperationalCalendar\n        lessons={lessons}\n        students={students}\n        instructors={instructors}\n        vehicles={vehicles}\n      />\n\n`;

if (!src.includes(anchor)) {
  throw new Error('[patch-dashboard-monthly-calendar] Missing dashboard insertion anchor');
}

src = src.replace(anchor, block + anchor);
fs.writeFileSync(file, src);
console.log('[patch-dashboard-monthly-calendar] patched dashboard monthly calendar');
