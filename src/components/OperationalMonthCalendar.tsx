import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Car, CheckCircle2, ChevronLeft, ChevronRight, Clock, GraduationCap, MapPin, UserRound } from 'lucide-react';
import { Instructor, Lesson, Student, Vehicle } from '../types';
import { formatDateVN } from './PremiumDateInput';

type OperationalMonthCalendarProps = {
  lessons: Lesson[];
  students: Student[];
  instructors: Instructor[];
  vehicles: Vehicle[];
};

const EXAM_DATES_STORAGE_KEY = 'lhp_center_exam_dates_v1';
const ACTIVE_STATUSES = ['Chờ xác nhận', 'Đã xác nhận', 'Đã hoàn thành'];
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const FULL_WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const getLocalTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const toISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromISODate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const isActiveLesson = (lesson: Lesson) => ACTIVE_STATUSES.includes(lesson.status);

const getStatusTone = (lesson: Lesson) => {
  if (lesson.status === 'Đã hoàn thành') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (lesson.status === 'Chờ xác nhận') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (lesson.status.includes('nghỉ') || lesson.status === 'Hủy lịch') return 'bg-red-50 text-red-700 border-red-100';
  return 'bg-blue-50 text-blue-700 border-blue-100';
};

const readExamDatesFromStorage = (): string[] => {
  try {
    const raw = localStorage.getItem(EXAM_DATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item))))).sort();
  } catch {
    return [];
  }
};

export const OperationalMonthCalendar: React.FC<OperationalMonthCalendarProps> = ({ lessons, students, instructors, vehicles }) => {
  const today = getLocalTodayString();
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = fromISODate(today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [centerExamDates, setCenterExamDates] = useState<string[]>(() => readExamDatesFromStorage());

  useEffect(() => {
    const refreshExamDates = () => setCenterExamDates(readExamDatesFromStorage());
    window.addEventListener('storage', refreshExamDates);
    const interval = window.setInterval(refreshExamDates, 2500);
    return () => {
      window.removeEventListener('storage', refreshExamDates);
      window.clearInterval(interval);
    };
  }, []);

  const lessonsByDate = useMemo(() => {
    return lessons.reduce<Record<string, Lesson[]>>((acc, lesson) => {
      if (!acc[lesson.date]) acc[lesson.date] = [];
      acc[lesson.date].push(lesson);
      return acc;
    }, {});
  }, [lessons]);

  const calendarDays = useMemo(() => {
    const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const gridStart = addDays(start, -start.getDay());
    const totalCells = Math.ceil((start.getDay() + end.getDate()) / 7) * 7;
    return Array.from({ length: totalCells }, (_, index) => addDays(gridStart, index));
  }, [monthCursor]);

  const selectedLessons = useMemo(() => {
    return [...(lessonsByDate[selectedDate] || [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [lessonsByDate, selectedDate]);

  const selectedActiveLessons = selectedLessons.filter(isActiveLesson);
  const selectedCompletedLessons = selectedLessons.filter((lesson) => lesson.status === 'Đã hoàn thành');
  const selectedPendingLessons = selectedLessons.filter((lesson) => lesson.status === 'Chờ xác nhận');
  const isSelectedExamDate = centerExamDates.includes(selectedDate);
  const selectedDateObject = fromISODate(selectedDate);

  const monthLabel = `Tháng ${monthCursor.getMonth() + 1}/${monthCursor.getFullYear()}`;

  const selectedWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (isSelectedExamDate) warnings.push('Ngày thi trung tâm • tự xếp tay, không tự động nhét ca học.');
    if (selectedPendingLessons.length > 0) warnings.push(`${selectedPendingLessons.length} ca chờ xác nhận.`);
    const missingAttendance = selectedLessons.filter((lesson) => lesson.status === 'Đã xác nhận' && lesson.attendanceStatus === 'Chưa điểm danh').length;
    if (missingAttendance > 0) warnings.push(`${missingAttendance} ca chưa điểm danh.`);
    const debtStudents = selectedLessons
      .map((lesson) => students.find((student) => student.id === lesson.studentId))
      .filter((student): student is Student => Boolean(student && student.remainingAmount > 0));
    const uniqueDebtStudents = new Set(debtStudents.map((student) => student.id));
    if (uniqueDebtStudents.size > 0) warnings.push(`${uniqueDebtStudents.size} học viên còn công nợ trong ngày này.`);
    return warnings;
  }, [isSelectedExamDate, selectedLessons, selectedPendingLessons.length, students]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1fr] gap-4">
      <div className="rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-600" /> Lịch tháng vận hành
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">Bấm vào từng ngày để xem ca học, ngày thi, xe, thầy và việc cần xử lý.</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-2xl bg-slate-50 p-1 border border-slate-100">
            <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} className="h-9 w-9 rounded-xl bg-white border border-slate-100 text-slate-600 flex items-center justify-center active:scale-95">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[108px] text-center text-xs font-black text-slate-800">{monthLabel}</span>
            <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} className="h-9 w-9 rounded-xl bg-white border border-slate-100 text-slate-600 flex items-center justify-center active:scale-95">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-[10px] font-black text-slate-400 uppercase py-1">{day}</div>
          ))}
          {calendarDays.map((date) => {
            const iso = toISODate(date);
            const dayLessons = lessonsByDate[iso] || [];
            const activeCount = dayLessons.filter(isActiveLesson).length;
            const completedCount = dayLessons.filter((lesson) => lesson.status === 'Đã hoàn thành').length;
            const pendingCount = dayLessons.filter((lesson) => lesson.status === 'Chờ xác nhận').length;
            const isCurrentMonth = date.getMonth() === monthCursor.getMonth();
            const isToday = iso === today;
            const isSelected = iso === selectedDate;
            const isExamDate = centerExamDates.includes(iso);

            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={`min-h-[66px] rounded-2xl border p-1.5 text-left transition-all active:scale-[0.98] ${isSelected ? 'border-blue-500 bg-blue-50 shadow-sm' : isExamDate ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50/70'} ${!isCurrentMonth ? 'opacity-45' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-black ${isToday ? 'text-blue-700' : isExamDate ? 'text-red-700' : 'text-slate-800'}`}>{date.getDate()}</span>
                  {isExamDate && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[8px] font-black text-white">THI</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {activeCount > 0 && <span className="h-2 w-2 rounded-full bg-blue-500" title={`${activeCount} ca học`} />}
                  {completedCount > 0 && <span className="h-2 w-2 rounded-full bg-emerald-500" title={`${completedCount} ca xong`} />}
                  {pendingCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" title={`${pendingCount} ca chờ`} />}
                  {isExamDate && <span className="h-2 w-2 rounded-full bg-red-600" title="Ngày thi" />}
                </div>
                {(activeCount > 0 || isExamDate) && (
                  <div className="mt-1 text-[9px] font-black text-slate-500">
                    {activeCount > 0 ? `${activeCount} ca` : ''}{isExamDate ? ' • thi' : ''}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-black text-slate-500">
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Có ca học</div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Đã xong</div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Chờ xác nhận</div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Ngày thi</div>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900">{FULL_WEEKDAYS[selectedDateObject.getDay()]}, {formatDateVN(selectedDate)}</h3>
            <p className="text-[11px] font-bold text-slate-400 mt-1">Chi tiết vận hành trong ngày đã chọn</p>
          </div>
          {isSelectedExamDate && (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black text-red-700">Ngày thi • tự xếp tay</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-3">
            <div className="text-[10px] font-black text-blue-500 uppercase">Ca học</div>
            <div className="text-2xl font-black text-blue-700">{selectedActiveLessons.length}</div>
          </div>
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
            <div className="text-[10px] font-black text-emerald-500 uppercase">Đã xong</div>
            <div className="text-2xl font-black text-emerald-700">{selectedCompletedLessons.length}</div>
          </div>
          <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
            <div className="text-[10px] font-black text-amber-500 uppercase">Cần xem</div>
            <div className="text-2xl font-black text-amber-700">{selectedWarnings.length}</div>
          </div>
        </div>

        {selectedWarnings.length > 0 && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-700 uppercase">
              <AlertTriangle className="h-4 w-4" /> Việc cần xử lý
            </div>
            {selectedWarnings.map((warning) => (
              <div key={warning} className="text-[11px] font-bold text-amber-800">• {warning}</div>
            ))}
          </div>
        )}

        <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
          {selectedLessons.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">
              Chưa có ca học trong ngày này.
            </div>
          ) : (
            selectedLessons.map((lesson) => {
              const student = students.find((item) => item.id === lesson.studentId);
              const instructor = instructors.find((item) => item.id === lesson.instructorId);
              const vehicle = vehicles.find((item) => item.id === lesson.vehicleId);
              return (
                <div key={lesson.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                        <Clock className="h-4 w-4 text-blue-600" /> {lesson.startTime} - {lesson.endTime}
                      </div>
                      <div className="mt-1 text-sm font-black uppercase text-slate-800">{student?.name || 'Chưa rõ học viên'}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${getStatusTone(lesson)}`}>{lesson.status}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-bold text-slate-500">
                    <div className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5 text-slate-400" /> {student?.licenseClass || 'Chưa rõ hạng'} • {lesson.lessonType}</div>
                    <div className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-slate-400" /> GV: {instructor?.name || 'Chưa gán'}</div>
                    <div className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5 text-slate-400" /> Xe: {vehicle ? `${vehicle.name} (${vehicle.plate})` : 'Chưa gán'}</div>
                    <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-slate-400" /> Điểm danh: {lesson.attendanceStatus}</div>
                  </div>

                  {(lesson.pickupLocation || lesson.trainingLocation) && (
                    <div className="rounded-xl bg-white border border-slate-100 p-2 text-[11px] font-bold text-slate-600 space-y-1">
                      {lesson.pickupLocation && <div className="flex gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" /> Đón: {lesson.pickupLocation}</div>}
                      {lesson.trainingLocation && <div>🎯 Bài tập: {lesson.trainingLocation}</div>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
