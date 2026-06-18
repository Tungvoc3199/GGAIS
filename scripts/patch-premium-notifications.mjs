import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = 'src';
const SOURCE_EXTS = new Set(['.ts', '.tsx']);
const PROVIDER_FILE = path.normalize('src/components/ui/PremiumDialogProvider.tsx');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function escapeReplacementText(text) {
  return text.replaceAll('$', '$$$$');
}

function patchScheduleConfirm(source) {
  let next = source;
  next = next.replace(
    'const shiftLessonDateDemo = (les: Lesson) => {',
    'const shiftLessonDateDemo = async (les: Lesson) => {'
  );

  next = next.replace(
    "const confirmMove = window.confirm(`[Mô phỏng kéo thả] Bạn có muốn dời lịch của học viên sang ngày hôm sau (${new Date(dateStr).toLocaleDateString('vi-VN')}): ${les.startTime} - ${les.endTime}?`);",
    "const confirmMove = await (window.__lhpConfirm?.({ title: 'Dời lịch học', message: `[Mô phỏng kéo thả] Bạn có muốn dời lịch của học viên sang ngày hôm sau (${new Date(dateStr).toLocaleDateString('vi-VN')}): ${les.startTime} - ${les.endTime}?`, confirmText: 'Dời lịch', cancelText: 'Giữ nguyên', tone: 'warning' }) ?? Promise.resolve(false));"
  );
  return next;
}

function patchStudentConfirms(source) {
  let next = source;

  next = next.replaceAll(
    'if (confirm("Gỡ tài liệu ảnh chụp này khỏi hồ sơ học viên?")) {',
    "if (await (window.__lhpConfirm?.({ title: 'Gỡ tài liệu', message: 'Gỡ tài liệu ảnh chụp này khỏi hồ sơ học viên?', confirmText: 'Gỡ bỏ', cancelText: 'Giữ lại', tone: 'danger' }) ?? Promise.resolve(false))) {"
  );

  next = next.replaceAll(
    'if (confirm("Gỡ ảnh chân dung thẻ này khỏi hồ sơ học viên?")) {',
    "if (await (window.__lhpConfirm?.({ title: 'Gỡ ảnh chân dung', message: 'Gỡ ảnh chân dung thẻ này khỏi hồ sơ học viên?', confirmText: 'Gỡ bỏ', cancelText: 'Giữ lại', tone: 'danger' }) ?? Promise.resolve(false))) {"
  );

  next = next.replace(
    'if (window.confirm(`Bạn có chắc chắn muốn đối soát lại toàn bộ công nợ của học viên ${selectedStudent.name} từ nguồn sổ cái thực tế?`)) {',
    "if (await (window.__lhpConfirm?.({ title: 'Đối soát công nợ', message: `Bạn có chắc chắn muốn đối soát lại toàn bộ công nợ của học viên ${selectedStudent.name} từ nguồn sổ cái thực tế?`, confirmText: 'Đồng ý đối soát', cancelText: 'Hủy', tone: 'warning' }) ?? Promise.resolve(false))) {"
  );

  return next;
}

function patchAlerts(source) {
  let next = source;
  next = next.replace(/window[.]alert\s*\(/g, 'void window.__lhpAlert?.(');
  next = next.replace(/(^|[^\w.$])alert\s*\(/g, (_match, prefix) => `${prefix}void window.__lhpAlert?.(`);
  return next;
}

const files = walk(SRC_DIR);
let changedFiles = [];

for (const file of files) {
  const normalized = path.normalize(file);
  if (normalized === PROVIDER_FILE) continue;

  const original = fs.readFileSync(file, 'utf8');
  let patched = original;

  if (normalized.endsWith(path.normalize('src/components/Schedule.tsx'))) {
    patched = patchScheduleConfirm(patched);
  }
  if (normalized.endsWith(path.normalize('src/components/Students.tsx'))) {
    patched = patchStudentConfirms(patched);
  }

  patched = patchAlerts(patched);

  if (patched !== original) {
    fs.writeFileSync(file, patched);
    changedFiles.push(file);
  }
}

const leftovers = [];
for (const file of files) {
  const normalized = path.normalize(file);
  if (normalized === PROVIDER_FILE) continue;
  const text = fs.readFileSync(file, 'utf8');
  const hasNativeAlert = /(^|[^\w.$])alert\s*\(|window[.]alert\s*\(/.test(text);
  const hasNativeConfirm = /(^|[^\w.$])confirm\s*\(|window[.]confirm\s*\(/.test(text);
  if (hasNativeAlert || hasNativeConfirm) {
    leftovers.push(`${file}${hasNativeAlert ? ' alert' : ''}${hasNativeConfirm ? ' confirm' : ''}`);
  }
}

if (leftovers.length > 0) {
  throw new Error(`[patch-premium-notifications] Native browser dialogs still found:\n${leftovers.join('\n')}`);
}

console.log(`[patch-premium-notifications] Premium notifications applied. Changed files: ${changedFiles.length ? changedFiles.join(', ') : 'none'}`);
