import fs from 'node:fs';

const file = 'src/components/Students.tsx';
const marker = 'STUDENT_RENDER_SORT_BY_GIVEN_NAME';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-student-render-sort-by-given-name] already patched');
  process.exit(0);
}

const helperAnchor = `const AVAILABLE_TAGS = ['Đang ôn thi', 'Mới nhập môn', 'Cần phụ đạo', 'Yếu lý thuyết', 'Lái yếu'];\n`;
const helper = `// ${marker}\nconst getStudentDisplayNameSortKey = (student: { name?: string; code?: string }) => {\n  const normalized = String(student?.name || '')\n    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '')\n    .replace(/đ/g, 'd')\n    .replace(/Đ/g, 'D')\n    .toLowerCase()\n    .trim();\n  const parts = normalized.split(/\\s+/).filter(Boolean);\n  const givenName = parts.length ? parts[parts.length - 1] : '';\n  return givenName + ' ' + normalized + ' ' + String(student?.code || '');\n};\n\nconst sortStudentsByGivenNameABC = <T extends { name?: string; code?: string }>(list: T[]): T[] => {\n  return [...list].sort((a, b) => getStudentDisplayNameSortKey(a).localeCompare(getStudentDisplayNameSortKey(b), 'vi'));\n};\n\n`;

if (!src.includes(helperAnchor)) {
  throw new Error('[patch-student-render-sort-by-given-name] Missing helper anchor');
}
src = src.replace(helperAnchor, helperAnchor + helper);

const renderMap = `          filteredStudents.map((s) => {`;
const sortedRenderMap = `          sortStudentsByGivenNameABC(filteredStudents).map((s) => {`;
if (!src.includes(renderMap)) {
  throw new Error('[patch-student-render-sort-by-given-name] Missing filteredStudents render map');
}
src = src.replace(renderMap, sortedRenderMap);

fs.writeFileSync(file, src);
console.log('[patch-student-render-sort-by-given-name] forced render list sort by given name ABC');
