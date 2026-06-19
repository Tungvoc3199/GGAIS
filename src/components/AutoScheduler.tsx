import React, { useMemo, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { getLocalTodayString, getLocalOffsetString } from '../utils/dateUtils';
import { CheckCircle2, Clock, Filter, Info, Play, ShieldCheck, Sparkles, Users, XCircle } from 'lucide-react';
import { Instructor, Lesson, Student, Vehicle } from '../types';

interface AutoSchedulerProps {
  onNavigate: (view: string) => void;
}

type Strategy = 'balanced' | 'examPriority' | 'operationOptimize' | 'datPriority';
type DraftStatus = 'ok' | 'warning';

type TimeWindow = {
  start: string;
  end: string;
};

type DraftLesson = {
  id: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  vehicleId: string;
  vehicleName: string;
  date: string;
  startTime: string;
  endTime: string;
  score: number;
  status: DraftStatus;
  reasons: string[];
  warnings: string[];
};

type FailedDraft = {
  studentId: string;
  studentName: string;
  reasons: string[];
};

const safeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeText = (value: unknown): string => String(value || '').toLowerCase().trim();

const toMinutes = (time: string): number => {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

const formatDate = (date: string) => {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
};

const dateRange = (from: string, to: string): string[] => {
  const dates: string[] = [];
  const cur = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cur <= end && dates.length < 45) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

const isActiveLesson = (lesson: Lesson) => lesson.status !== 'Hủy lịch' && lesson.status !== 'Học viên báo nghỉ' && lesson.status !== 'Giảng viên báo nghỉ';

const isInstructorSchedulable = (instructor: Instructor) => {
  const rawActive = (instructor as any).active;
  if (rawActive === false) return false;
  const status = normalizeText((instructor as any).status || (instructor as any).teachingStatus || (instructor as any).state);
  if (!status) return true;
  return !['nghỉ', 'nghi', 'tạm ngưng', 'tam ngung', 'ngừng', 'ngung', 'khóa', 'khoa', 'inactive', 'không hoạt động', 'khong hoat dong'].some(blocked => status.includes(blocked));
};

const isVehicleSchedulable = (vehicle: Vehicle) => {
  const status = normalizeText(vehicle.status);
  if (!status) return true;
  return !['bảo dưỡng', 'bao duong', 'tạm ngưng', 'tam ngung', 'ngừng', 'ngung', 'hỏng', 'hong', 'inactive'].some(blocked => status.includes(blocked));
};

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const as = toMinutes(aStart);
  const ae = toMinutes(aEnd);
  const bs = toMinutes(bStart);
  const be = toMinutes(bEnd);
  return as < be && bs < ae;
};

const sameDayCount = (studentId: string, date: string, lessons: Lesson[], drafts: DraftLesson[]) => {
  const existing = lessons.filter(l => isActiveLesson(l) && l.studentId === studentId && l.date === date).length;
  const drafted = drafts.filter(l => l.studentId === studentId && l.date === date).length;
  return existing + drafted;
};

const licenseMatchesInstructor = (student: Student, instructor: Instructor) => {
  if (!isInstructorSchedulable(instructor)) return false;
  if (!instructor.vehicleTypes || instructor.vehicleTypes.length === 0) return true;
  const allowed = instructor.vehicleTypes.map(t => normalizeText(t)).join(' ');
  const license = normalizeText(student.licenseClass);
  if (license.includes('b')) return allowed.includes('b') || allowed.includes('số tự động') || allowed.includes('số sàn') || allowed.includes('tu dong') || allowed.includes('so san');
  if (license.includes('c1') || license.includes('c')) return allowed.includes('c1') || allowed.includes('c') || allowed.includes('b');
  return instructor.vehicleTypes.includes(student.licenseClass);
};

const licenseMatchesVehicle = (student: Student, vehicle: Vehicle) => {
  if (!isVehicleSchedulable(vehicle)) return false;
  const hint = `${vehicle.suitableLicenseClass || ''} ${vehicle.category || ''} ${vehicle.name || ''} ${vehicle.transmission || ''}`.toLowerCase();
  const isAuto = vehicle.transmission === 'Số tự động' || hint.includes('tự động') || hint.includes('tu dong') || hint.includes('automatic') || hint.includes('at');
  const isManual = vehicle.transmission === 'Số sàn' || hint.includes('số sàn') || hint.includes('so san') || hint.includes('manual') || hint.includes('mt');
  if (student.licenseClass === 'B số tự động') return isAuto;
  if (student.licenseClass === 'B số sàn') return isAuto || isManual || hint.includes('b');
  if (student.licenseClass === 'C1') return isAuto || hint.includes('c1') || hint.includes('hạng c') || hint.includes('hang c') || hint.includes(' c');
  return true;
};

const isInstructorWorking = (instructor: Instructor, date: string, start: string, end: string) => {
  if (instructor.daysOff?.includes(date)) return false;
  const weekday = new Date(`${date}T00:00:00`).getDay();
  if (instructor.workingDays?.length && !instructor.workingDays.includes(weekday)) return false;
  if (instructor.workingHours?.start && toMinutes(start) < toMinutes(instructor.workingHours.start)) return false;
  if (instructor.workingHours?.end && toMinutes(end) > toMinutes(instructor.workingHours.end)) return false;
  return true;
};

const hasConflict = (
  studentId: string,
  instructorId: string,
  vehicleId: string,
  date: string,
  startTime: string,
  endTime: string,
  lessons: Lesson[],
  drafts: DraftLesson[]
): string[] => {
  const reasons: string[] = [];
  lessons.filter(l => isActiveLesson(l) && l.date === date && overlaps(startTime, endTime, l.startTime, l.endTime)).forEach(l => {
    if (l.studentId === studentId) reasons.push('Học viên đã có lịch trùng giờ');
    if (l.instructorId === instructorId) reasons.push('Giảng viên đã có lịch trùng giờ');
    if (l.vehicleId === vehicleId) reasons.push('Xe tập đã có lịch trùng giờ');
  });
  drafts.filter(l => l.date === date && overlaps(startTime, endTime, l.startTime, l.endTime)).forEach(l => {
    if (l.studentId === studentId) reasons.push('Học viên đã có lịch nháp trùng giờ');
    if (l.instructorId === instructorId) reasons.push('Giảng viên đã có lịch nháp trùng giờ');
    if (l.vehicleId === vehicleId) reasons.push('Xe tập đã có lịch nháp trùng giờ');
  });
  return Array.from(new Set(reasons));
};

const scoreCandidate = (
  student: Student,
  instructor: Instructor,
  vehicle: Vehicle,
  strategy: Strategy,
  date: string,
  examDates: Record<string, string>
) => {
  let score = 50;
  const reasons: string[] = [];
  if (student.assignedInstructorId && student.assignedInstructorId === instructor.id) {
    score += 18;
    reasons.push('Đúng giảng viên đang phụ trách');
  } else if (!student.assignedInstructorId) {
    reasons.push('Tự chọn giảng viên phù hợp');
  }
  if (student.assignedVehicleId && student.assignedVehicleId === vehicle.id) {
    score += 14;
    reasons.push('Đúng xe đã gán cho học viên');
  } else if (!student.assignedVehicleId) {
    reasons.push('Tự chọn xe phù hợp');
  }
  if (student.remainingSessions > 0) {
    score += Math.min(18, student.remainingSessions * 2);
    reasons.push(`Còn ${student.remainingSessions} buổi cần học`);
  }
  if (strategy === 'examPriority' && examDates[student.id]) {
    const days = Math.ceil((new Date(`${examDates[student.id]}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86400000);
    if (days >= 0 && days <= 14) {
      score += 30;
      reasons.push('Ưu tiên vì gần ngày thi');
    }
  }
  if (strategy === 'datPriority') {
    const datSummary = (student as any).datSummary;
    if (datSummary && datSummary.isDatCompleted === false) {
      score += 22;
      reasons.push('Ưu tiên vì chưa đạt DAT');
    }
  }
  if (strategy === 'operationOptimize') {
    score += 8;
    reasons.push('Ưu tiên lấp đầy khung vận hành');
  }
  if (strategy === 'balanced') {
    score += Math.max(0, 10 - student.completedSessions);
    reasons.push('Xếp đều theo tiến độ học');
  }
  return { score, reasons };
};

export const AutoScheduler: React.FC<AutoSchedulerProps> = ({ onNavigate }) => {
  const { students, instructors, vehicles, lessons, settings, addAuditLog } = useDatabase();

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(getLocalTodayString());
  const [endDate, setEndDate] = useState(getLocalOffsetString(7));
  const [strategy, setStrategy] = useState<Strategy>('balanced');
  const [preferredDays, setPreferredDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [instructorPref, setInstructorPref] = useState('auto');
  const [vehiclePref, setVehiclePref] = useState('auto');
  const [sessionsPerStudent, setSessionsPerStudent] = useState(1);
  const [examDates, setExamDates] = useState<Record<string, string>>({});
  const [timeWindows, setTimeWindows] = useState<TimeWindow[]>([
    { start: '08:00', end: '10:00' },
    { start: '10:15', end: '12:15' },
    { start: '13:30', end: '15:30' },
    { start: '15:45', end: '17:45' }
  ]);
  const [draftLessons, setDraftLessons] = useState<DraftLesson[]>([]);
  const [failedDrafts, setFailedDrafts] = useState<FailedDraft[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  const activeStudents: Student[] = useMemo(
    () => students.filter(s => ['Đang học', 'Mới đăng ký'].includes(s.status) && safeNumber(s.remainingSessions) > 0),
    [students]
  );

  const selectedStudents: Student[] = useMemo(
    () => activeStudents.filter(s => selectedStudentIds.includes(s.id)),
    [activeStudents, selectedStudentIds]
  );

  const schedulableInstructors = useMemo(() => instructors.filter(isInstructorSchedulable), [instructors]);
  const schedulableVehicles = useMemo(() => vehicles.filter(isVehicleSchedulable), [vehicles]);

  const strategyLabel = {
    balanced: 'Xếp đều',
    examPriority: 'Ưu tiên sắp thi',
    operationOptimize: 'Tối ưu xe & giáo viên',
    datPriority: 'Ưu tiên thiếu DAT'
  }[strategy];

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllStudents = () => {
    setSelectedStudentIds(prev => prev.length === activeStudents.length ? [] : activeStudents.map(s => s.id));
  };

  const togglePreferredDay = (day: number) => {
    setPreferredDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const updateWindow = (index: number, key: keyof TimeWindow, value: string) => {
    setTimeWindows(prev => prev.map((w, i) => i === index ? { ...w, [key]: value } : w));
  };

  const generateDraft = async () => {
    if (selectedStudents.length === 0) {
      await window.__lhpAlert?.({ title: 'Chưa chọn học viên', message: 'Vui lòng chọn ít nhất một học viên để tạo lịch nháp.', tone: 'warning' });
      return;
    }
    if (schedulableInstructors.length === 0) {
      await window.__lhpAlert?.({ title: 'Chưa có giảng viên hợp lệ', message: 'Không tìm thấy giảng viên đang hoạt động để xếp lịch. Vui lòng kiểm tra tab Giảng viên.', tone: 'warning' });
      return;
    }
    if (schedulableVehicles.length === 0) {
      await window.__lhpAlert?.({ title: 'Chưa có xe hợp lệ', message: 'Không tìm thấy xe đang hoạt động để xếp lịch. Vui lòng kiểm tra tab Xe tập lái.', tone: 'warning' });
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      await window.__lhpAlert?.({ title: 'Sai khoảng ngày', message: 'Ngày bắt đầu không được lớn hơn ngày kết thúc.', tone: 'warning' });
      return;
    }

    const generated: DraftLesson[] = [];
    const failures: FailedDraft[] = [];
    const targetMap: Map<string, number> = new Map(
      selectedStudents.map((s): [string, number] => [
        s.id,
        Math.min(Math.max(1, safeNumber(sessionsPerStudent, 1)), Math.max(1, safeNumber(s.remainingSessions, 1)))
      ])
    );
    const countMap = new Map<string, number>();
    const maxPerDay = Math.max(1, safeNumber(settings?.autoSchedulingRules?.maxLessonsPerStudentPerDay, 1));
    const dates = dateRange(startDate, endDate).filter(d => preferredDays.includes(new Date(`${d}T00:00:00`).getDay()));

    for (const date of dates) {
      for (const timeWindow of timeWindows) {
        const candidates: { student: Student; instructor: Instructor; vehicle: Vehicle; score: number; reasons: string[]; warnings: string[] }[] = [];

        for (const student of selectedStudents) {
          const currentCount = safeNumber(countMap.get(student.id), 0);
          const targetCount = safeNumber(targetMap.get(student.id), 1);
          if (currentCount >= targetCount) continue;
          if (sameDayCount(student.id, date, lessons, generated) >= maxPerDay) continue;

          const instructorPool = schedulableInstructors.filter(i => instructorPref === 'auto' ? licenseMatchesInstructor(student, i) : i.id === instructorPref && licenseMatchesInstructor(student, i));
          const vehiclePool = schedulableVehicles.filter(v => vehiclePref === 'auto' ? licenseMatchesVehicle(student, v) : v.id === vehiclePref && licenseMatchesVehicle(student, v));

          for (const instructor of instructorPool) {
            if (!isInstructorWorking(instructor, date, timeWindow.start, timeWindow.end)) continue;
            for (const vehicle of vehiclePool) {
              const conflicts = hasConflict(student.id, instructor.id, vehicle.id, date, timeWindow.start, timeWindow.end, lessons, generated);
              if (conflicts.length > 0) continue;
              const result = scoreCandidate(student, instructor, vehicle, strategy, date, examDates);
              const warnings: string[] = [];
              candidates.push({ student, instructor, vehicle, score: result.score, reasons: result.reasons, warnings });
            }
          }
        }

        const best = candidates.sort((a, b) => b.score - a.score)[0];
        if (best) {
          generated.push({
            id: `draft_${date}_${timeWindow.start}_${best.student.id}`,
            studentId: best.student.id,
            studentName: best.student.name,
            instructorId: best.instructor.id,
            instructorName: best.instructor.name,
            vehicleId: best.vehicle.id,
            vehicleName: `${best.vehicle.name} (${best.vehicle.plate})`,
            date,
            startTime: timeWindow.start,
            endTime: timeWindow.end,
            score: best.score,
            status: best.warnings.length ? 'warning' : 'ok',
            reasons: best.reasons,
            warnings: best.warnings
          });
          countMap.set(best.student.id, safeNumber(countMap.get(best.student.id), 0) + 1);
        }
      }
    }

    selectedStudents.forEach(student => {
      const currentCount = safeNumber(countMap.get(student.id), 0);
      const targetCount = safeNumber(targetMap.get(student.id), 1);
      if (currentCount < targetCount) {
        failures.push({
          studentId: student.id,
          studentName: student.name,
          reasons: [
            `Mới xếp được ${currentCount}/${targetCount} ca nháp`,
            'Không còn khung giờ phù hợp hoặc giảng viên/xe/học viên bị trùng lịch',
            'Hãy nới khoảng ngày, thêm khung giờ, đổi xe/giảng viên hoặc giảm số ca mỗi học viên'
          ]
        });
      }
    });

    setDraftLessons(generated.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)));
    setFailedDrafts(failures);
    setHasGenerated(true);
    addAuditLog?.('Tạo lịch nháp tự động', `Tạo ${generated.length} lịch nháp bằng Auto Scheduler v2 Draft Mode. Chiến lược: ${strategyLabel}. Chưa ghi lịch thật.`);
    window.__lhpToast?.(`Đã tạo ${generated.length} lịch nháp. Chưa ghi vào lịch thật.`, 'success', 'Xếp lịch nháp');
  };

  const exportDraftText = () => {
    const text = draftLessons.map(d => `${formatDate(d.date)} ${d.startTime}-${d.endTime} | ${d.studentName} | GV: ${d.instructorName} | Xe: ${d.vehicleName} | Điểm: ${d.score}`).join('\n');
    navigator.clipboard?.writeText(text);
    window.__lhpToast?.('Đã copy danh sách lịch nháp.', 'success', 'Auto Scheduler');
  };

  return (
    <div className="font-sans py-3 px-1 max-w-6xl mx-auto space-y-5">
      <div className="rounded-3xl bg-slate-900 text-white p-5 md:p-6 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
              <ShieldCheck className="h-3.5 w-3.5" /> Auto Scheduler v2 - Draft Mode
            </div>
            <h1 className="mt-3 text-xl md:text-2xl font-black tracking-tight">Xếp lịch tự động an toàn</h1>
            <p className="mt-1 text-xs md:text-sm text-slate-300 font-semibold">Chỉ tạo lịch nháp → kiểm tra xung đột → admin duyệt sau. Không tự ghi vào lịch thật.</p>
          </div>
          <button onClick={() => onNavigate('lich-hoc')} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black text-white hover:bg-white/15">
            Mở lịch hiện tại
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2"><Filter className="h-4 w-4 text-blue-600" /> 1. Phạm vi xếp</h2>
            <div className="grid grid-cols-2 gap-3 text-xs font-bold">
              <label className="space-y-1"><span className="text-slate-400 uppercase text-[10px]">Từ ngày</span><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-slate-400 uppercase text-[10px]">Đến ngày</span><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="space-y-1 col-span-2"><span className="text-slate-400 uppercase text-[10px]">Giảng viên</span><select value={instructorPref} onChange={e => setInstructorPref(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2"><option value="auto">Tự chọn phù hợp</option>{schedulableInstructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
              <label className="space-y-1 col-span-2"><span className="text-slate-400 uppercase text-[10px]">Xe tập</span><select value={vehiclePref} onChange={e => setVehiclePref(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2"><option value="auto">Tự chọn phù hợp</option>{schedulableVehicles.map(v => <option key={v.id} value={v.id}>{v.name} - {v.plate}</option>)}</select></label>
              <label className="space-y-1 col-span-2"><span className="text-slate-400 uppercase text-[10px]">Số ca / học viên trong lượt nháp</span><input type="number" min={1} max={7} value={sessionsPerStudent} onChange={e => setSessionsPerStudent(safeNumber(e.target.value, 1))} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> 2. Chiến lược</h2>
            <div className="grid grid-cols-1 gap-2 text-xs font-black">
              {([
                ['balanced', 'Xếp đều', 'Không dồn quá nhiều vào một học viên'],
                ['examPriority', 'Ưu tiên sắp thi', 'Ưu tiên học viên có hạn thi gần'],
                ['datPriority', 'Ưu tiên thiếu DAT', 'Đẩy học viên chưa đạt DAT'],
                ['operationOptimize', 'Tối ưu vận hành', 'Lấp đầy khung giờ xe và giáo viên']
              ] as [Strategy, string, string][]).map(item => (
                <button key={item[0]} onClick={() => setStrategy(item[0])} className={`text-left rounded-2xl border p-3 ${strategy === item[0] ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-100 text-slate-700'}`}>
                  <div>{item[1]}</div><div className="mt-1 text-[11px] font-bold text-slate-400">{item[2]}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2"><Clock className="h-4 w-4 text-blue-600" /> 3. Khung giờ</h2>
            <div className="grid grid-cols-7 gap-1 text-[10px] font-black">
              {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((label, idx) => (
                <button key={idx} onClick={() => togglePreferredDay(idx)} className={`rounded-xl py-2 ${preferredDays.includes(idx) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{label}</button>
              ))}
            </div>
            <div className="space-y-2">
              {timeWindows.map((w, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2">
                  <input type="time" value={w.start} onChange={e => updateWindow(idx, 'start', e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
                  <input type="time" value={w.end} onChange={e => updateWindow(idx, 'end', e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /> 4. Chọn học viên</h2>
              <button onClick={toggleAllStudents} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-700">
                {selectedStudentIds.length === activeStudents.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả đang học'}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-100">
              {activeStudents.length === 0 ? <div className="p-5 text-center text-xs font-bold text-slate-400">Không có học viên đang học cần xếp lịch.</div> : activeStudents.map(s => (
                <div key={s.id} className={`p-3 grid grid-cols-[auto,1fr] gap-3 ${selectedStudentIds.includes(s.id) ? 'bg-blue-50/40' : 'bg-white'}`}>
                  <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} className="mt-1 h-4 w-4" />
                  <div className="min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div><div className="text-sm font-black text-slate-900 truncate">{s.name}</div><div className="text-[11px] font-bold text-slate-400">{s.code} • {s.licenseClass} • còn {s.remainingSessions} buổi</div></div>
                      {selectedStudentIds.includes(s.id) && strategy === 'examPriority' && <input type="date" value={examDates[s.id] || ''} onChange={e => setExamDates(prev => ({ ...prev, [s.id]: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={generateDraft} className="w-full rounded-2xl bg-blue-600 py-4 text-sm font-black text-white shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">
              <Play className="h-4 w-4" /> Tạo lịch nháp an toàn
            </button>
          </div>

          {hasGenerated && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4"><div className="text-[10px] font-black text-emerald-500 uppercase">Xếp được</div><div className="text-2xl font-black text-emerald-700">{draftLessons.length}</div></div>
              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4"><div className="text-[10px] font-black text-amber-500 uppercase">Cần kiểm tra</div><div className="text-2xl font-black text-amber-700">{draftLessons.filter(d => d.status === 'warning').length}</div></div>
              <div className="rounded-2xl bg-red-50 border border-red-100 p-4"><div className="text-[10px] font-black text-red-500 uppercase">Chưa xếp đủ</div><div className="text-2xl font-black text-red-700">{failedDrafts.length}</div></div>
            </div>
          )}

          {draftLessons.length > 0 && (
            <div className="rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-black text-slate-900 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Lịch nháp đề xuất</h2><button onClick={exportDraftText} className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700">Copy danh sách</button></div>
              <div className="space-y-2 max-h-[520px] overflow-y-auto">
                {draftLessons.map(d => (
                  <div key={d.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-xs font-bold">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div><div className="text-sm font-black text-slate-900">{formatDate(d.date)} • {d.startTime} - {d.endTime}</div><div className="text-slate-600 mt-1">{d.studentName} • GV: {d.instructorName} • Xe: {d.vehicleName}</div></div>
                      <div className={`rounded-full px-3 py-1 text-[10px] font-black ${d.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>Điểm {d.score}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">{d.reasons.map(r => <span key={r} className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-500 border border-slate-100">{r}</span>)}</div>
                    {d.warnings.length > 0 && <div className="mt-2 text-[11px] text-amber-600 font-bold">⚠ {d.warnings.join(' • ')}</div>}
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-500 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 shrink-0" /> Đây mới là lịch nháp. Nút duyệt ghi vào lịch thật sẽ triển khai ở Sprint 2 sau khi anh test logic nháp ổn.
              </div>
            </div>
          )}

          {failedDrafts.length > 0 && (
            <div className="rounded-3xl bg-white border border-red-100 p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-black text-red-700 flex items-center gap-2"><XCircle className="h-4 w-4" /> Chưa xếp đủ / không xếp được</h2>
              {failedDrafts.map(f => <div key={f.studentId} className="rounded-2xl bg-red-50 border border-red-100 p-3 text-xs font-bold text-red-700"><div className="font-black">{f.studentName}</div><ul className="mt-1 list-disc pl-5 space-y-1">{f.reasons.map(r => <li key={r}>{r}</li>)}</ul></div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
