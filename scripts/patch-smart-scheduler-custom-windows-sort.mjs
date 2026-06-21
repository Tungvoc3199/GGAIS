import fs from 'node:fs';

const file = 'src/components/AutoScheduler.tsx';
const marker = 'SMART_SCHEDULER_CUSTOM_WINDOWS_SORT_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-smart-scheduler-custom-windows-sort] already patched');
  process.exit(0);
}

function replaceOnce(oldText, newText, label) {
  if (!src.includes(oldText)) {
    throw new Error(`[patch-smart-scheduler-custom-windows-sort] Missing block: ${label}`);
  }
  src = src.replace(oldText, newText);
}

const helperAnchor = "const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];\n";
const helperBlock = helperAnchor + `\n// ${marker}\nconst vietnameseStudentSortKey = (name: string) => {\n  const parts = String(name || '').replace(/\\s+/g, ' ').trim().split(' ').filter(Boolean);\n  if (parts.length === 0) return '';\n  const givenName = parts[parts.length - 1] || '';\n  return \`${'${givenName}'} ${'${parts.join(\' \')}'}\`;\n};\n`;
if (src.includes(helperAnchor) && !src.includes('const vietnameseStudentSortKey =')) {
  src = src.replace(helperAnchor, helperBlock);
}

replaceOnce(
  `  const activeStudents: Student[] = useMemo(\n    () => students.filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0),\n    [students]\n  );`,
  `  const activeStudents: Student[] = useMemo(\n    () => students\n      .filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0)\n      .sort((a, b) => vietnameseStudentSortKey(a.name).localeCompare(vietnameseStudentSortKey(b.name), 'vi', { sensitivity: 'base' })),\n    [students]\n  );`,
  'activeStudents Vietnamese given-name sort'
);

replaceOnce(
  `  const getStudentAvailability = (studentId: string): StudentAvailability => {\n    const saved = studentAvailability[studentId];\n    return {\n      days: saved?.days?.length ? saved.days : preferredDays,\n      windows: saved?.windows?.length ? saved.windows : [timeWindows[0] || { start: '08:00', end: '10:00' }],\n      urgent: Boolean(saved?.urgent)\n    };\n  };`,
  `  const getStudentAvailability = (studentId: string): StudentAvailability => {\n    const saved = studentAvailability[studentId];\n    const defaultWindows = timeWindows.length ? timeWindows : [{ start: '08:00', end: '10:00' }];\n    return {\n      days: saved?.days?.length ? saved.days : preferredDays,\n      windows: saved?.windows?.length ? saved.windows : defaultWindows,\n      urgent: Boolean(saved?.urgent)\n    };\n  };`,
  'default student availability uses all default windows'
);

src = src.replaceAll(
  "{ days: preferredDays, windows: [timeWindows[0] || { start: '08:00', end: '10:00' }] }",
  "{ days: preferredDays, windows: timeWindows.length ? timeWindows : [{ start: '08:00', end: '10:00' }] }"
);

replaceOnce(
  `    for (const date of dates) {\n      for (const timeWindow of timeWindows) {`,
  `    for (const date of dates) {\n      const candidateTimeWindows = Array.from(new Map(\n        selectedStudents.flatMap(student => {\n          const availability = getStudentAvailability(student.id);\n          const weekday = new Date(\`${'${date}'}T00:00:00\`).getDay();\n          if (!availability.days.includes(weekday)) return [];\n          return availability.windows.map((windowItem): [string, TimeWindow] => [\`${'${windowItem.start}'}-${'${windowItem.end}'}\`, windowItem]);\n        })\n      ).values()).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));\n\n      for (const timeWindow of candidateTimeWindows) {`,
  'candidate windows respect student custom availability'
);

src = src.replace(
  "'Không còn khung giờ khớp lịch rảnh học viên hoặc giảng viên/xe/học viên bị trùng lịch'",
  "'Không còn khung giờ khớp lịch rảnh học viên, hoặc giảng viên/xe/học viên bị trùng lịch'"
);

fs.writeFileSync(file, src);
console.log('[patch-smart-scheduler-custom-windows-sort] patched custom student time windows and given-name sorting');
