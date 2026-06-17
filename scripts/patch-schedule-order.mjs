import fs from 'node:fs';

const file = 'src/components/Schedule.tsx';
let src = fs.readFileSync(file, 'utf8');
let changed = false;

const oldDisplayed = `  const displayedLessons = lessons.filter(l => {
    if (filterInstructorId && filterInstructorId !== 'all') {
      return l.instructorId === filterInstructorId;
    }
    return true;
  });`;

const newDisplayed = `  const toLessonMinutes = (time?: string): number => {
    const [hour, minute] = String(time || '00:00').split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
    return hour * 60 + minute;
  };

  const compareLessonsBySchedule = (a: Lesson, b: Lesson): number => {
    const byDate = String(a.date || '').localeCompare(String(b.date || ''));
    if (byDate !== 0) return byDate;
    const byStart = toLessonMinutes(a.startTime) - toLessonMinutes(b.startTime);
    if (byStart !== 0) return byStart;
    const byEnd = toLessonMinutes(a.endTime) - toLessonMinutes(b.endTime);
    if (byEnd !== 0) return byEnd;
    return String(a.id || '').localeCompare(String(b.id || ''));
  };

  const displayedLessons = [...lessons]
    .filter(l => {
      if (filterInstructorId && filterInstructorId !== 'all') {
        return l.instructorId === filterInstructorId;
      }
      return true;
    })
    .sort(compareLessonsBySchedule);`;

if (src.includes(oldDisplayed)) {
  src = src.replace(oldDisplayed, newDisplayed);
  changed = true;
}

const replacements = [
  [`.sort((a,b)=> b.date.localeCompare(a.date))`, `.sort(compareLessonsBySchedule)`],
  [`.sort((a,b)=>a.startTime.localeCompare(b.startTime))`, `.sort(compareLessonsBySchedule)`],
  [`.sort((a, b) => a.startTime.localeCompare(b.startTime))`, `.sort(compareLessonsBySchedule)`],
  [`const insLessons = displayedLessons.filter(l => l.date === selectedDate && l.instructorId === ins.id);`, `const insLessons = displayedLessons\n                  .filter(l => l.date === selectedDate && l.instructorId === ins.id)\n                  .sort(compareLessonsBySchedule);`],
  [`const vehLessons = displayedLessons.filter(l => l.date === selectedDate && l.vehicleId === veh.id);`, `const vehLessons = displayedLessons\n                  .filter(l => l.date === selectedDate && l.vehicleId === veh.id)\n                  .sort(compareLessonsBySchedule);`],
  [`const allWeekLessons = displayedLessons.filter(l => \n          weekDays.some(wd => wd.dateStr === l.date)\n        );`, `const allWeekLessons = displayedLessons\n          .filter(l => weekDays.some(wd => wd.dateStr === l.date))\n          .sort(compareLessonsBySchedule);`]
];

for (const [oldText, newText] of replacements) {
  if (src.includes(oldText)) {
    src = src.replaceAll(oldText, newText);
    changed = true;
  }
}

if (!src.includes('compareLessonsBySchedule')) {
  throw new Error('[patch-schedule-order] Không chèn được hàm sắp xếp lịch học.');
}

if (changed) {
  fs.writeFileSync(file, src);
  console.log('[patch-schedule-order] Lesson display order patched: date ASC, startTime ASC, endTime ASC.');
} else {
  console.log('[patch-schedule-order] Schedule order already patched.');
}
