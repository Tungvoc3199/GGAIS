import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`[patch-vietnam-date-format] Missing block: ${label}`);
  }
  return source.replace(oldText, newText);
}

function ensureImport(source, importLine, anchor, label) {
  if (source.includes(importLine.trim())) return source;
  if (!source.includes(anchor)) {
    throw new Error(`[patch-vietnam-date-format] Missing import anchor: ${label}`);
  }
  return source.replace(anchor, anchor + importLine);
}

function patchStudents() {
  const file = 'src/components/Students.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('VIETNAM_DATE_FORMAT_STUDENTS')) {
    console.log('[patch-vietnam-date-format] Students already patched');
    return;
  }

  src = ensureImport(
    src,
    `import { PremiumDateInput } from './PremiumDateInput';\n// VIETNAM_DATE_FORMAT_STUDENTS\n`,
    `import { useDatabase } from '../context/DatabaseContext';\n`,
    'Students useDatabase import'
  );

  src = replaceOnce(
    src,
    `                  <input\n                    type="date"\n                    required\n                    value={newDob}\n                    onChange={(e) => setNewDob(e.target.value)}\n                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800"\n                  />`,
    `                  <PremiumDateInput\n                    required\n                    value={newDob}\n                    onChange={setNewDob}\n                  />`,
    'Students new DOB input'
  );

  fs.writeFileSync(file, src);
  console.log('[patch-vietnam-date-format] patched Students DOB input');
}

function patchSchedule() {
  const file = 'src/components/Schedule.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('VIETNAM_DATE_FORMAT_SCHEDULE')) {
    console.log('[patch-vietnam-date-format] Schedule already patched');
    return;
  }

  src = ensureImport(
    src,
    `import { PremiumDateInput, formatDateVN } from './PremiumDateInput';\n// VIETNAM_DATE_FORMAT_SCHEDULE\n`,
    `import { checkLessonConflicts, suggestAvailableSlots } from '../services/scheduling';\n`,
    'Schedule scheduling import'
  );

  src = src.replace(
    `            <span className="text-[10px] text-slate-400 font-medium">({new Date(les.date).toLocaleDateString('vi-VN')})</span>`,
    `            <span className="text-[10px] text-slate-400 font-medium">({formatDateVN(les.date)})</span>`
  );

  src = replaceOnce(
    src,
    `                    <input\n                      type="date"\n                      required\n                      value={formDate}\n                      onChange={(e) => setFormDate(e.target.value)}\n                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-slate-850"\n                    />`,
    `                    <PremiumDateInput\n                      required\n                      value={formDate}\n                      onChange={setFormDate}\n                    />`,
    'Schedule formDate input'
  );

  src = replaceOnce(
    src,
    `                <input\n                  type="date"\n                  value={newDate}\n                  onChange={(e) => setNewDate(e.target.value)}\n                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-blue-500"\n                />`,
    `                <PremiumDateInput\n                  value={newDate}\n                  onChange={setNewDate}\n                />`,
    'Schedule quick reschedule date input'
  );

  fs.writeFileSync(file, src);
  console.log('[patch-vietnam-date-format] patched Schedule date inputs');
}

function patchAutoScheduler() {
  const file = 'src/components/AutoScheduler.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('VIETNAM_DATE_FORMAT_AUTOSCHEDULER')) {
    console.log('[patch-vietnam-date-format] AutoScheduler already patched');
    return;
  }

  src = ensureImport(
    src,
    `import { PremiumDateInput } from './PremiumDateInput';\n// VIETNAM_DATE_FORMAT_AUTOSCHEDULER\n`,
    `import { Instructor, Lesson, Student, Vehicle } from '../types';\n`,
    'AutoScheduler types import'
  );

  src = replaceOnce(
    src,
    `<label className="space-y-1"><span className="text-slate-400 uppercase text-[10px]">Từ ngày</span><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>`,
    `<label className="space-y-1"><span className="text-slate-400 uppercase text-[10px]">Từ ngày</span><PremiumDateInput value={startDate} onChange={setStartDate} /></label>`,
    'AutoScheduler start date input'
  );

  src = replaceOnce(
    src,
    `<label className="space-y-1"><span className="text-slate-400 uppercase text-[10px]">Đến ngày</span><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>`,
    `<label className="space-y-1"><span className="text-slate-400 uppercase text-[10px]">Đến ngày</span><PremiumDateInput value={endDate} onChange={setEndDate} /></label>`,
    'AutoScheduler end date input'
  );

  src = replaceOnce(
    src,
    `{selectedStudentIds.includes(s.id) && strategy === 'examPriority' && <input type="date" value={examDates[s.id] || ''} onChange={e => setExamDates(prev => ({ ...prev, [s.id]: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />}`,
    `{selectedStudentIds.includes(s.id) && strategy === 'examPriority' && <PremiumDateInput value={examDates[s.id] || ''} onChange={(value) => setExamDates(prev => ({ ...prev, [s.id]: value }))} />}`,
    'AutoScheduler exam date input'
  );

  fs.writeFileSync(file, src);
  console.log('[patch-vietnam-date-format] patched AutoScheduler date inputs');
}

patchStudents();
patchSchedule();
patchAutoScheduler();
