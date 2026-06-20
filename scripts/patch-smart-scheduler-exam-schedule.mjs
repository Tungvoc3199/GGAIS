import fs from 'node:fs';

const file = 'src/components/AutoScheduler.tsx';
const marker = 'SMART_SCHEDULER_CENTER_EXAM_SCHEDULE_V2';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-smart-scheduler-exam-schedule] already patched');
  process.exit(0);
}

function replaceOnce(oldText, newText, label) {
  if (!src.includes(oldText)) {
    throw new Error(`[patch-smart-scheduler-exam-schedule] Missing block: ${label}`);
  }
  src = src.replace(oldText, newText);
}

if (!src.includes("import { ExamScheduleImporter } from './ExamScheduleImporter';")) {
  if (src.includes("import { PremiumTimeSelect } from './PremiumTimeSelect';\n")) {
    src = src.replace("import { PremiumTimeSelect } from './PremiumTimeSelect';\n", "import { PremiumTimeSelect } from './PremiumTimeSelect';\nimport { ExamScheduleImporter } from './ExamScheduleImporter';\n");
  } else {
    src = src.replace("import { Instructor, Lesson, Student, Vehicle } from '../types';\n", "import { Instructor, Lesson, Student, Vehicle } from '../types';\nimport { ExamScheduleImporter } from './ExamScheduleImporter';\n");
  }
}

replaceOnce(
  "  const [examDates, setExamDates] = useState<Record<string, string>>({});\n",
  "  const [examDates, setExamDates] = useState<Record<string, string>>({});\n  const [centerExamDates, setCenterExamDates] = useState<string[]>([]);\n",
  'centerExamDates state'
);

const functionAnchor = "  const getDaysSinceLastLesson = (studentId: string, targetDate: string): number | null => {";
const helperBlock = [
  "  // " + marker,
  "  const isCenterExamDate = (targetDate: string): boolean => centerExamDates.includes(targetDate);",
  "",
  "  const getUpcomingCenterExamDate = (targetDate: string): string => {",
  "    return [...centerExamDates].sort().find(date => date >= targetDate) || '';",
  "  };",
  "",
  "  const getDaysToDate = (fromDate: string, toDate: string): number => {",
  "    return Math.ceil((new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()) / 86400000);",
  "  };",
  ""
].join('\n');
if (src.includes(functionAnchor)) {
  src = src.replace(functionAnchor, helperBlock + functionAnchor);
} else {
  const generateAnchor = "  const generateDraft = async () => {";
  if (!src.includes(generateAnchor)) throw new Error('[patch-smart-scheduler-exam-schedule] Missing generateDraft anchor');
  src = src.replace(generateAnchor, helperBlock + generateAnchor);
}

if (src.includes("    const dates = dateRange(startDate, endDate);")) {
  src = src.replace(
    "    const dates = dateRange(startDate, endDate);",
    "    const dates = dateRange(startDate, endDate).filter(d => !isCenterExamDate(d));"
  );
} else {
  throw new Error('[patch-smart-scheduler-exam-schedule] Missing dateRange block');
}

replaceOnce(
  "              candidates.push({ student, instructor, vehicle, score: result.score + smartScore, reasons: [...smartReasons, ...result.reasons], warnings });",
  [
    "              const centerExamDate = getUpcomingCenterExamDate(date);",
    "              if (centerExamDate) {",
    "                const daysToCenterExam = getDaysToDate(date, centerExamDate);",
    "                if (daysToCenterExam >= 1 && daysToCenterExam <= 21) {",
    "                  smartScore += Math.max(8, 30 - daysToCenterExam);",
    "                  smartReasons.push('Theo lịch thi trung tâm ' + formatDate(centerExamDate));",
    "                  if (daysToCenterExam <= 7) smartReasons.push('Ưu tiên ôn tập / xe chip trước thi');",
    "                }",
    "              }",
    "              candidates.push({ student, instructor, vehicle, score: result.score + smartScore, reasons: [...smartReasons, ...result.reasons], warnings });"
  ].join('\n'),
  'center exam score'
);

const scheduleUiAnchor = "          <div className=\"rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-4\">\n            <h2 className=\"text-sm font-black text-slate-900 flex items-center gap-2\"><Clock";
if (!src.includes(scheduleUiAnchor)) {
  throw new Error('[patch-smart-scheduler-exam-schedule] Missing clock card anchor');
}
src = src.replace(
  scheduleUiAnchor,
  "          <ExamScheduleImporter dates={centerExamDates} onChange={setCenterExamDates} />\n\n" + scheduleUiAnchor
);

src = src.replace(
  "Đây mới là lịch nháp đề xuất. Anh duyệt/chỉnh rồi Sprint sau mới ghi vào lịch thật, không tự động ghi thẳng.",
  "Đây mới là lịch nháp đề xuất. Ngày thi trung tâm được đánh dấu đỏ và không tự xếp ca học; anh tự xếp tay ngày đó để đưa học viên đi thi."
);

fs.writeFileSync(file, src);
console.log('[patch-smart-scheduler-exam-schedule] patched center exam schedule importer, red exam-day skip logic and scoring');
