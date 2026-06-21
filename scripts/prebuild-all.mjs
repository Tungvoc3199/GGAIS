import { spawnSync } from 'node:child_process';

const scripts = [
  'patch-lesson-progress.mjs',
  'patch-schedule-order.mjs',
  'patch-dat-progress.mjs',
  'patch-dat-ledger.mjs',
  'patch-student-tuition-defaults.mjs',
  'patch-premium-input-controls.mjs',
  'patch-ocr-card-route.mjs',
  'patch-exam-schedule-ocr-route.mjs',
  'patch-ocr-dob-normalize.mjs',
  'patch-vietnam-date-format.mjs',
  'patch-student-abc-sort.mjs',
  'patch-student-render-sort-by-given-name.mjs',
  'patch-smart-scheduler-student-availability.mjs',
  'patch-autoscheduler-time-24h.mjs',
  'patch-smart-scheduler-exam-schedule.mjs',
  'patch-dashboard-monthly-calendar.mjs'
];

for (const script of scripts) {
  console.log(`[prebuild-all] running ${script}`);
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
