import fs from 'node:fs';

const file = 'src/components/AutoScheduler.tsx';
const marker = 'SMART_SCHEDULER_CUSTOM_WINDOWS_SORT_V1';
let src = fs.readFileSync(file, 'utf8');

function softReplace(oldText, newText, label) {
  if (!src.includes(oldText)) {
    console.log(`[patch-smart-scheduler-custom-windows-sort] skip ${label}: current source shape already changed`);
    return false;
  }
  src = src.replace(oldText, newText);
  console.log(`[patch-smart-scheduler-custom-windows-sort] patched ${label}`);
  return true;
}

function ensureHelper() {
  if (src.includes(marker) || src.includes('const vietnameseStudentSortKey =')) {
    console.log('[patch-smart-scheduler-custom-windows-sort] helper already present');
    return;
  }

  const helperAnchor = "const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];\n";
  if (!src.includes(helperAnchor)) {
    console.log('[patch-smart-scheduler-custom-windows-sort] skip helper: WEEKDAY_LABELS anchor not found');
    return;
  }

  const helperBlock = [
    helperAnchor.trimEnd(),
    '',
    `// ${marker}`,
    "const vietnameseStudentSortKey = (name: string) => {",
    "  const parts = String(name || '').replace(/\\s+/g, ' ').trim().split(' ').filter(Boolean);",
    "  if (parts.length === 0) return '';",
    "  const givenName = parts[parts.length - 1] || '';",
    "  return givenName + ' ' + parts.join(' ');",
    "};",
    ''
  ].join('\n');

  src = src.replace(helperAnchor, helperBlock);
  console.log('[patch-smart-scheduler-custom-windows-sort] patched helper');
}

ensureHelper();

softReplace(
  `  const activeStudents: Student[] = useMemo(\n    () => students.filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0),\n    [students]\n  );`,
  `  const activeStudents: Student[] = useMemo(\n    () => students\n      .filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0)\n      .sort((a, b) => vietnameseStudentSortKey(a.name).localeCompare(vietnameseStudentSortKey(b.name), 'vi', { sensitivity: 'base' })),\n    [students]\n  );`,
  'activeStudents Vietnamese given-name sort'
);

softReplace(
  `  const getStudentAvailability = (studentId: string): StudentAvailability => {\n    const saved = studentAvailability[studentId];\n    return {\n      days: saved?.days?.length ? saved.days : preferredDays,\n      windows: saved?.windows?.length ? saved.windows : [timeWindows[0] || { start: '08:00', end: '10:00' }],\n      urgent: Boolean(saved?.urgent)\n    };\n  };`,
  `  const getStudentAvailability = (studentId: string): StudentAvailability => {\n    const saved = studentAvailability[studentId];\n    const defaultWindows = timeWindows.length ? timeWindows : [{ start: '08:00', end: '10:00' }];\n    return {\n      days: saved?.days?.length ? saved.days : preferredDays,\n      windows: saved?.windows?.length ? saved.windows : defaultWindows,\n      urgent: Boolean(saved?.urgent)\n    };\n  };`,
  'default student availability uses all default windows'
);

softReplace(
  "const current = prev[studentId] || { days: preferredDays, windows: [timeWindows[0] || { start: '08:00', end: '10:00' }] };\n      const nextDays = current.days.includes(day) ? current.days.filter(d => d !== day) : [...current.days, day].sort();",
  "const current = prev[studentId] || { days: preferredDays, windows: timeWindows.length ? timeWindows : [{ start: '08:00', end: '10:00' }] };\n      const nextDays = current.days.includes(day) ? current.days.filter(d => d !== day) : [...current.days, day].sort();",
  'student day toggle default windows'
);

softReplace(
  "const current = prev[studentId] || { days: preferredDays, windows: [timeWindows[0] || { start: '08:00', end: '10:00' }] };\n      return { ...prev, [studentId]: { ...current, urgent: !current.urgent } };",
  "const current = prev[studentId] || { days: preferredDays, windows: timeWindows.length ? timeWindows : [{ start: '08:00', end: '10:00' }] };\n      return { ...prev, [studentId]: { ...current, urgent: !current.urgent } };",
  'urgent toggle default windows'
);

softReplace(
  `  const updateStudentAvailabilityWindow = (studentId: string, index: number, key: keyof TimeWindow, value: string) => {\n    setStudentAvailability(prev => {\n      const current = prev[studentId] || { days: preferredDays, windows: [timeWindows[0] || { start: '08:00', end: '10:00' }] };\n      const windows = current.windows.length ? current.windows : [timeWindows[0] || { start: '08:00', end: '10:00' }];\n      const nextWindows = windows.map((w, i) => i === index ? { ...w, [key]: value } : w);\n      return { ...prev, [studentId]: { ...current, windows: nextWindows } };\n    });\n  };`,
  `  const updateStudentAvailabilityWindow = (studentId: string, index: number, key: keyof TimeWindow, value: string) => {\n    setStudentAvailability(prev => {\n      const fallbackWindow = timeWindows[0] || { start: '08:00', end: '10:00' };\n      const current = prev[studentId] || { days: preferredDays, windows: [fallbackWindow] };\n      const currentWindow = current.windows[index] || fallbackWindow;\n      const nextWindows = [{ ...currentWindow, [key]: value }];\n      return { ...prev, [studentId]: { ...current, windows: nextWindows } };\n    });\n  };`,
  'custom time selection uses only selected student window'
);

softReplace(
  `    for (const date of dates) {\n      for (const timeWindow of timeWindows) {`,
  `    for (const date of dates) {\n      const candidateTimeWindows = Array.from(new Map(\n        selectedStudents.flatMap(student => {\n          const availability = getStudentAvailability(student.id);\n          const weekday = new Date(date + 'T00:00:00').getDay();\n          if (!availability.days.includes(weekday)) return [];\n          return availability.windows.map((windowItem): [string, TimeWindow] => [windowItem.start + '-' + windowItem.end, windowItem]);\n        })\n      ).values()).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));\n\n      for (const timeWindow of candidateTimeWindows) {`,
  'candidate windows respect student custom availability'
);

src = src.replace(
  "'Không còn khung giờ khớp lịch rảnh học viên hoặc giảng viên/xe/học viên bị trùng lịch'",
  "'Không còn khung giờ khớp lịch rảnh học viên, hoặc giảng viên/xe/học viên bị trùng lịch'"
);

fs.writeFileSync(file, src);
console.log('[patch-smart-scheduler-custom-windows-sort] completed without blocking CI');
