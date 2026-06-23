import { spawnSync } from 'node:child_process';

const scripts = [
  'patch-lesson-progress.mjs',
  'patch-schedule-order.mjs',
  'patch-schedule-complete-actions.mjs',
  'patch-dat-progress.mjs',
  'patch-dat-ledger.mjs',
  'patch-student-tuition-defaults.mjs',
  'patch-premium-input-controls.mjs',
  'patch-ocr-card-route.mjs',
  'patch-exam-schedule-ocr-route.mjs',
  'patch-ocr-dob-normalize.mjs',
  'patch-vietnam-date-format.mjs',
  'patch-semi-auto-student-reminders.mjs',
  'patch-student-abc-sort.mjs',
  'patch-student-render-sort-by-given-name.mjs',
  'patch-student-detail-tabs-click.mjs',
  'patch-smart-scheduler-student-availability.mjs',
  'patch-autoscheduler-time-24h.mjs',
  'patch-smart-scheduler-exam-schedule.mjs',
  'patch-smart-scheduler-custom-windows-sort.mjs',
  'patch-dashboard-monthly-calendar.mjs'
];

const failedOptionalPatches = [];

for (const script of scripts) {
  console.log(`[prebuild-all] running ${script}`);
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit' });
  if (result.status !== 0) {
    failedOptionalPatches.push(`${script} exited with ${result.status}`);
    console.warn(`[prebuild-all] WARNING: optional patch skipped: ${script}. Build will continue so CI/deploy is not blocked by brittle patch anchors.`);
  }
}

if (failedOptionalPatches.length > 0) {
  console.warn('[prebuild-all] Optional patches skipped:');
  for (const item of failedOptionalPatches) console.warn(`- ${item}`);
}

console.log('[prebuild-all] completed. TypeScript/build remains the source of truth for deploy success.');
