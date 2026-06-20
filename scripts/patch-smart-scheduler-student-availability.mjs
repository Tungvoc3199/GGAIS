import fs from 'node:fs';

const file = 'src/components/AutoScheduler.tsx';
const marker = 'SMART_SCHEDULER_STUDENT_AVAILABILITY_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-smart-scheduler-student-availability] already patched');
  process.exit(0);
}

function replaceOnce(oldText, newText, label) {
  if (!src.includes(oldText)) {
    throw new Error(`[patch-smart-scheduler-student-availability] Missing block: ${label}`);
  }
  src = src.replace(oldText, newText);
}

if (!src.includes("import { PremiumTimeSelect } from './PremiumTimeSelect';")) {
  if (src.includes("import { PremiumDateInput } from './PremiumDateInput';\n")) {
    src = src.replace("import { PremiumDateInput } from './PremiumDateInput';\n", "import { PremiumDateInput } from './PremiumDateInput';\nimport { PremiumTimeSelect } from './PremiumTimeSelect';\n");
  } else {
    src = src.replace("import { Instructor, Lesson, Student, Vehicle } from '../types';\n", "import { Instructor, Lesson, Student, Vehicle } from '../types';\nimport { PremiumTimeSelect } from './PremiumTimeSelect';\n");
  }
}

replaceOnce(
  "type TimeWindow = {\n  start: string;\n  end: string;\n};\n",
  "type TimeWindow = {\n  start: string;\n  end: string;\n};\n\n// " + marker + "\ntype StudentAvailability = {\n  days: number[];\n  windows: TimeWindow[];\n  urgent?: boolean;\n};\n",
  'StudentAvailability type'
);

replaceOnce(
  "const formatDate = (date: string) => {\n  const [y, m, d] = date.split('-');\n  return `${d}/${m}/${y}`;\n};\n",
  "const formatDate = (date: string) => {\n  const [y, m, d] = date.split('-');\n  return `${d}/${m}/${y}`;\n};\n\nconst WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];\n",
  'weekday labels'
);

replaceOnce(
  "  const [timeWindows, setTimeWindows] = useState<TimeWindow[]>([\n    { start: '08:00', end: '10:00' },\n    { start: '10:15', end: '12:15' },\n    { start: '13:30', end: '15:30' },\n    { start: '15:45', end: '17:45' }\n  ]);\n",
  "  const [timeWindows, setTimeWindows] = useState<TimeWindow[]>([\n    { start: '08:00', end: '10:00' },\n    { start: '10:15', end: '12:15' },\n    { start: '13:30', end: '15:30' },\n    { start: '15:45', end: '17:45' }\n  ]);\n  const [studentAvailability, setStudentAvailability] = useState<Record<string, StudentAvailability>>({});\n",
  'studentAvailability state'
);

replaceOnce(
  "  const updateWindow = (index: number, key: keyof TimeWindow, value: string) => {\n    setTimeWindows(prev => prev.map((w, i) => i === index ? { ...w, [key]: value } : w));\n  };\n\n  const generateDraft = async () => {",
  [
    "  const updateWindow = (index: number, key: keyof TimeWindow, value: string) => {",
    "    setTimeWindows(prev => prev.map((w, i) => i === index ? { ...w, [key]: value } : w));",
    "  };",
    "",
    "  const getStudentAvailability = (studentId: string): StudentAvailability => {",
    "    const saved = studentAvailability[studentId];",
    "    return {",
    "      days: saved?.days?.length ? saved.days : preferredDays,",
    "      windows: saved?.windows?.length ? saved.windows : [timeWindows[0] || { start: '08:00', end: '10:00' }],",
    "      urgent: Boolean(saved?.urgent)",
    "    };",
    "  };",
    "",
    "  const toggleStudentAvailabilityDay = (studentId: string, day: number) => {",
    "    setStudentAvailability(prev => {",
    "      const current = prev[studentId] || { days: preferredDays, windows: [timeWindows[0] || { start: '08:00', end: '10:00' }] };",
    "      const nextDays = current.days.includes(day) ? current.days.filter(d => d !== day) : [...current.days, day].sort();",
    "      return { ...prev, [studentId]: { ...current, days: nextDays } };",
    "    });",
    "  };",
    "",
    "  const updateStudentAvailabilityWindow = (studentId: string, index: number, key: keyof TimeWindow, value: string) => {",
    "    setStudentAvailability(prev => {",
    "      const current = prev[studentId] || { days: preferredDays, windows: [timeWindows[0] || { start: '08:00', end: '10:00' }] };",
    "      const windows = current.windows.length ? current.windows : [timeWindows[0] || { start: '08:00', end: '10:00' }];",
    "      const nextWindows = windows.map((w, i) => i === index ? { ...w, [key]: value } : w);",
    "      return { ...prev, [studentId]: { ...current, windows: nextWindows } };",
    "    });",
    "  };",
    "",
    "  const toggleStudentUrgent = (studentId: string) => {",
    "    setStudentAvailability(prev => {",
    "      const current = prev[studentId] || { days: preferredDays, windows: [timeWindows[0] || { start: '08:00', end: '10:00' }] };",
    "      return { ...prev, [studentId]: { ...current, urgent: !current.urgent } };",
    "    });",
    "  };",
    "",
    "  const getDaysSinceLastLesson = (studentId: string, targetDate: string): number | null => {",
    "    const target = new Date(`${targetDate}T00:00:00`).getTime();",
    "    const previous = lessons",
    "      .filter(l => isActiveLesson(l) && l.studentId === studentId && new Date(`${l.date}T00:00:00`).getTime() < target)",
    "      .sort((a, b) => b.date.localeCompare(a.date))[0];",
    "    if (!previous) return null;",
    "    return Math.floor((target - new Date(`${previous.date}T00:00:00`).getTime()) / 86400000);",
    "  };",
    "",
    "  const generateDraft = async () => {"
  ].join('\n'),
  'availability functions'
);

src = src.replace(
  "    const dates = dateRange(startDate, endDate).filter(d => preferredDays.includes(new Date(`${d}T00:00:00`).getDay()));",
  "    const dates = dateRange(startDate, endDate);"
);

replaceOnce(
  "          if (currentCount >= targetCount) continue;\n          if (sameDayCount(student.id, date, lessons, generated) >= maxPerDay) continue;\n\n          const instructorPool = schedulableInstructors.filter(i => instructorPref === 'auto' ? licenseMatchesInstructor(student, i) : i.id === instructorPref && licenseMatchesInstructor(student, i));",
  [
    "          if (currentCount >= targetCount) continue;",
    "          if (sameDayCount(student.id, date, lessons, generated) >= maxPerDay) continue;",
    "",
    "          const availability = getStudentAvailability(student.id);",
    "          const weekday = new Date(`${date}T00:00:00`).getDay();",
    "          if (!availability.days.includes(weekday)) continue;",
    "          const fitsStudentWindow = availability.windows.some(w => toMinutes(timeWindow.start) >= toMinutes(w.start) && toMinutes(timeWindow.end) <= toMinutes(w.end));",
    "          if (!fitsStudentWindow) continue;",
    "",
    "          const instructorPool = schedulableInstructors.filter(i => instructorPref === 'auto' ? licenseMatchesInstructor(student, i) : i.id === instructorPref && licenseMatchesInstructor(student, i));"
  ].join('\n'),
  'student availability filter'
);

replaceOnce(
  "              const result = scoreCandidate(student, instructor, vehicle, strategy, date, examDates);\n              const warnings: string[] = [];\n              candidates.push({ student, instructor, vehicle, score: result.score, reasons: result.reasons, warnings });",
  [
    "              const result = scoreCandidate(student, instructor, vehicle, strategy, date, examDates);",
    "              const warnings: string[] = [];",
    "              const smartReasons = ['Khớp lịch rảnh học viên'];",
    "              let smartScore = 45;",
    "              if (availability.urgent) {",
    "                smartScore += 28;",
    "                smartReasons.push('Cần học gấp');",
    "              }",
    "              if (examDates[student.id]) {",
    "                const daysToExam = Math.ceil((new Date(`${examDates[student.id]}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86400000);",
    "                if (daysToExam >= 0 && daysToExam <= 21) {",
    "                  smartScore += 22;",
    "                  smartReasons.push('Gần hạn thi');",
    "                }",
    "              }",
    "              const daysSinceLastLesson = getDaysSinceLastLesson(student.id, date);",
    "              if (daysSinceLastLesson !== null && daysSinceLastLesson >= 7) {",
    "                smartScore += Math.min(18, daysSinceLastLesson);",
    "                smartReasons.push('Tránh bỏ lâu quá');",
    "              }",
    "              candidates.push({ student, instructor, vehicle, score: result.score + smartScore, reasons: [...smartReasons, ...result.reasons], warnings });"
  ].join('\n'),
  'smart score candidate'
);

src = src.replace("'Không còn khung giờ phù hợp hoặc giảng viên/xe/học viên bị trùng lịch'", "'Không còn khung giờ khớp lịch rảnh học viên hoặc giảng viên/xe/học viên bị trùng lịch'");
src = src.replace("'Tạo lịch nháp tự động'", "'Tạo gợi ý xếp lịch thông minh'");
src = src.replace("Auto Scheduler v2 - Draft Mode", "Gợi ý xếp lịch thông minh");
src = src.replace("Xếp lịch tự động an toàn", "Gợi ý xếp lịch thông minh");
src = src.replace("Chỉ tạo lịch nháp → kiểm tra xung đột → admin duyệt sau. Không tự ghi vào lịch thật.", "Học viên rảnh trước → app gợi ý ca → anh duyệt → mới ghi lịch thật.");
src = src.replace("1. Phạm vi xếp", "1. Phạm vi gợi ý");
src = src.replace("3. Khung giờ", "3. Khung giờ mặc định của thầy/xe");
src = src.replace("4. Chọn học viên", "4. Chọn học viên & lịch rảnh");
src = src.replace("Tạo lịch nháp an toàn", "Tạo gợi ý lịch nháp");
src = src.replace("Đã tạo ${generated.length} lịch nháp. Chưa ghi vào lịch thật.", "Đã tạo ${generated.length} gợi ý lịch nháp. Chưa ghi vào lịch thật.");
src = src.replace("Auto Scheduler", "Gợi ý xếp lịch");

const examLine = "                      {selectedStudentIds.includes(s.id) && strategy === 'examPriority' && <PremiumDateInput value={examDates[s.id] || ''} onChange={(value) => setExamDates(prev => ({ ...prev, [s.id]: value }))} />}";
const availabilityBlock = [
  examLine,
  "                      {selectedStudentIds.includes(s.id) && (",
  "                        <div className=\"mt-3 rounded-2xl border border-blue-100 bg-white p-3 md:col-span-2\">",
  "                          <div className=\"mb-2 text-[10px] font-black uppercase tracking-widest text-blue-600\">Lịch rảnh của học viên</div>",
  "                          <div className=\"mb-2 grid grid-cols-7 gap-1\">",
  "                            {WEEKDAY_LABELS.map((label, idx) => (",
  "                              <button key={label} type=\"button\" onClick={() => toggleStudentAvailabilityDay(s.id, idx)} className={`rounded-xl py-1.5 text-[10px] font-black ${getStudentAvailability(s.id).days.includes(idx) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{label}</button>",
  "                            ))}",
  "                          </div>",
  "                          <div className=\"grid grid-cols-2 gap-2\">",
  "                            <PremiumTimeSelect value={getStudentAvailability(s.id).windows[0]?.start || '08:00'} onChange={(value) => updateStudentAvailabilityWindow(s.id, 0, 'start', value)} />",
  "                            <PremiumTimeSelect value={getStudentAvailability(s.id).windows[0]?.end || '10:00'} onChange={(value) => updateStudentAvailabilityWindow(s.id, 0, 'end', value)} />",
  "                          </div>",
  "                          <button type=\"button\" onClick={() => toggleStudentUrgent(s.id)} className={`mt-2 rounded-xl px-3 py-2 text-[11px] font-black ${getStudentAvailability(s.id).urgent ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>⚡ Cần học gấp / sắp thi</button>",
  "                        </div>",
  "                      )}"
].join('\n');

if (src.includes(examLine)) {
  src = src.replace(examLine, availabilityBlock);
} else {
  console.warn('[patch-smart-scheduler-student-availability] exam date line not found; availability UI not injected');
}

src = src.replace("Đây mới là lịch nháp. Nút duyệt ghi vào lịch thật sẽ triển khai ở Sprint 2 sau khi anh test logic nháp ổn.", "Đây mới là lịch nháp đề xuất. Anh duyệt/chỉnh rồi Sprint sau mới ghi vào lịch thật, không tự động ghi thẳng.");

fs.writeFileSync(file, src);
console.log('[patch-smart-scheduler-student-availability] patched smart scheduler student-first availability flow');
