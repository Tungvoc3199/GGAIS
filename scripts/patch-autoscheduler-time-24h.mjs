import fs from 'node:fs';

const file = 'src/components/AutoScheduler.tsx';
const marker = 'AUTOSCHEDULER_TIME_24H_INPUTS_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-autoscheduler-time-24h] already patched');
  process.exit(0);
}

if (!src.includes("import { PremiumTimeSelect } from './PremiumTimeSelect';")) {
  src = src.replace(
    "import { Instructor, Lesson, Student, Vehicle } from '../types';\n",
    "import { Instructor, Lesson, Student, Vehicle } from '../types';\nimport { PremiumTimeSelect } from './PremiumTimeSelect';\n"
  );
}

const oldBlock = `              {timeWindows.map((w, idx) => (\n                <div key={idx} className="grid grid-cols-2 gap-2">\n                  <input type="time" value={w.start} onChange={e => updateWindow(idx, 'start', e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />\n                  <input type="time" value={w.end} onChange={e => updateWindow(idx, 'end', e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />\n                </div>\n              ))}`;

const newBlock = `              {/* ${marker} */}\n              {timeWindows.map((w, idx) => (\n                <div key={idx} className="grid grid-cols-2 gap-2">\n                  <PremiumTimeSelect value={w.start} onChange={(value) => updateWindow(idx, 'start', value)} className="text-xs" />\n                  <PremiumTimeSelect value={w.end} onChange={(value) => updateWindow(idx, 'end', value)} className="text-xs" />\n                </div>\n              ))}`;

if (!src.includes(oldBlock)) {
  throw new Error('[patch-autoscheduler-time-24h] Missing AutoScheduler time window block');
}

src = src.replace(oldBlock, newBlock);
fs.writeFileSync(file, src);
console.log('[patch-autoscheduler-time-24h] patched AutoScheduler time windows to 24h custom inputs');
