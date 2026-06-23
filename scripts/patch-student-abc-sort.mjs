import fs from 'node:fs';

function normalizeVietnameseSortTextSource() {
  return `
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
}

function ensureHelper(src, anchor, marker, label) {
  if (src.includes(marker) || src.includes('const compareStudentsByVietnameseName')) return src;
  if (!src.includes(anchor)) {
    console.log(`[patch-student-abc-sort] skip helper: ${label}`);
    return src;
  }
  return src.replace(anchor, anchor + `\n// ${marker}\n` + normalizeVietnameseSortTextSource());
}

function patchStudents() {
  const file = 'src/components/Students.tsx';
  let src = fs.readFileSync(file, 'utf8');
  src = ensureHelper(
    src,
    "const AVAILABLE_TAGS = ['Đang ôn thi', 'Mới nhập môn', 'Cần phụ đạo', 'Yếu lý thuyết', 'Lái yếu'];\n",
    'STUDENT_ABC_SORT_STUDENTS',
    'Students helper anchor'
  );

  if (src.includes('}).sort(compareStudentsByVietnameseName);')) {
    console.log('[patch-student-abc-sort] Students filtered list already sorted');
  } else {
    const exactBlock = `    return matchSearch && matchClass && matchStatus && matchInst && matchDebt && matchInactive && matchTag && matchArchived;\n  });`;
    if (src.includes(exactBlock)) {
      src = src.replace(exactBlock, `    return matchSearch && matchClass && matchStatus && matchInst && matchDebt && matchInactive && matchTag && matchArchived;\n  }).sort(compareStudentsByVietnameseName);`);
      console.log('[patch-student-abc-sort] patched Students filtered list ABC sort');
    } else {
      console.log('[patch-student-abc-sort] skip Students filtered sort: current source shape already changed');
    }
  }

  fs.writeFileSync(file, src);
}

function patchSchedule() {
  const file = 'src/components/Schedule.tsx';
  let src = fs.readFileSync(file, 'utf8');
  src = ensureHelper(
    src,
    `interface ScheduleProps {\n  quickFormOpen?: boolean;\n  onCloseQuickForm?: () => void;\n}\n`,
    'STUDENT_ABC_SORT_SCHEDULE',
    'Schedule helper anchor'
  );
  if (src.includes('{[...students].sort(compareStudentsByVietnameseName).map((s) => (')) {
    console.log('[patch-student-abc-sort] Schedule student selects already sorted');
  } else {
    src = src.replaceAll('{students.map((s) => (', '{[...students].sort(compareStudentsByVietnameseName).map((s) => (');
    console.log('[patch-student-abc-sort] patched Schedule student selects ABC sort');
  }
  fs.writeFileSync(file, src);
}

function patchAutoScheduler() {
  const file = 'src/components/AutoScheduler.tsx';
  let src = fs.readFileSync(file, 'utf8');
  src = ensureHelper(
    src,
    `const normalizeText = (value: unknown): string => String(value || '').toLowerCase().trim();\n`,
    'STUDENT_ABC_SORT_AUTOSCHEDULER',
    'AutoScheduler helper anchor'
  );

  if (src.includes('.sort(compareStudentsByVietnameseName)')) {
    console.log('[patch-student-abc-sort] AutoScheduler student list already sorted');
  } else {
    const oldBlock = `    () => students.filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0),`;
    if (src.includes(oldBlock)) {
      src = src.replace(oldBlock, `    () => students.filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0).sort(compareStudentsByVietnameseName),`);
      console.log('[patch-student-abc-sort] patched AutoScheduler student list ABC sort');
    } else {
      console.log('[patch-student-abc-sort] skip AutoScheduler activeStudents sort: current source shape already changed');
    }
  }

  fs.writeFileSync(file, src);
}

patchStudents();
patchSchedule();
patchAutoScheduler();
console.log('[patch-student-abc-sort] completed without blocking CI');
