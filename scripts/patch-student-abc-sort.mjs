import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`[patch-student-abc-sort] Missing block: ${label}`);
  }
  return source.replace(oldText, newText);
}

const helperCode = `
const normalizeVietnameseSortText = (value: unknown): string => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .trim();

const getVietnameseGivenNameKey = (fullName: unknown): string => {
  const normalized = normalizeVietnameseSortText(fullName);
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const givenName = parts[parts.length - 1];
  return givenName + ' ' + normalized;
};

const compareStudentsByVietnameseName = <T extends { name?: string; code?: string }>(a: T, b: T): number => {
  const byGivenName = getVietnameseGivenNameKey(a.name).localeCompare(getVietnameseGivenNameKey(b.name), 'vi');
  if (byGivenName !== 0) return byGivenName;
  return String(a.code || '').localeCompare(String(b.code || ''), 'vi');
};
`;

function patchStudents() {
  const file = 'src/components/Students.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('STUDENT_ABC_SORT_STUDENTS')) {
    console.log('[patch-student-abc-sort] Students already patched');
    return;
  }

  src = replaceOnce(
    src,
    `const AVAILABLE_TAGS = ['Đang ôn thi', 'Mới nhập môn', 'Cần phụ đạo', 'Yếu lý thuyết', 'Lái yếu'];\n`,
    `const AVAILABLE_TAGS = ['Đang ôn thi', 'Mới nhập môn', 'Cần phụ đạo', 'Yếu lý thuyết', 'Lái yếu'];\n// STUDENT_ABC_SORT_STUDENTS\n${helperCode}\n`,
    'Students helper anchor'
  );

  src = replaceOnce(
    src,
    `    return matchSearch && matchClass && matchStatus && matchInst && matchDebt && matchInactive && matchTag && matchArchived;\n  });`,
    `    return matchSearch && matchClass && matchStatus && matchInst && matchDebt && matchInactive && matchTag && matchArchived;\n  }).sort(compareStudentsByVietnameseName);`,
    'Students filtered sort'
  );

  fs.writeFileSync(file, src);
  console.log('[patch-student-abc-sort] patched Students list ABC sort');
}

function patchSchedule() {
  const file = 'src/components/Schedule.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('STUDENT_ABC_SORT_SCHEDULE')) {
    console.log('[patch-student-abc-sort] Schedule already patched');
    return;
  }

  src = replaceOnce(
    src,
    `interface ScheduleProps {\n  quickFormOpen?: boolean;\n  onCloseQuickForm?: () => void;\n}\n`,
    `interface ScheduleProps {\n  quickFormOpen?: boolean;\n  onCloseQuickForm?: () => void;\n}\n// STUDENT_ABC_SORT_SCHEDULE\n${helperCode}\n`,
    'Schedule helper anchor'
  );

  src = src.replaceAll(
    `{students.map((s) => (`,
    `{[...students].sort(compareStudentsByVietnameseName).map((s) => (`
  );

  fs.writeFileSync(file, src);
  console.log('[patch-student-abc-sort] patched Schedule student selects ABC sort');
}

function patchAutoScheduler() {
  const file = 'src/components/AutoScheduler.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('STUDENT_ABC_SORT_AUTOSCHEDULER')) {
    console.log('[patch-student-abc-sort] AutoScheduler already patched');
    return;
  }

  src = replaceOnce(
    src,
    `const normalizeText = (value: unknown): string => String(value || '').toLowerCase().trim();\n`,
    `const normalizeText = (value: unknown): string => String(value || '').toLowerCase().trim();\n// STUDENT_ABC_SORT_AUTOSCHEDULER\n${helperCode}\n`,
    'AutoScheduler helper anchor'
  );

  src = replaceOnce(
    src,
    `    () => students.filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0),`,
    `    () => students.filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0).sort(compareStudentsByVietnameseName),`,
    'AutoScheduler activeStudents sort'
  );

  fs.writeFileSync(file, src);
  console.log('[patch-student-abc-sort] patched AutoScheduler student list ABC sort');
}

patchStudents();
patchSchedule();
patchAutoScheduler();
