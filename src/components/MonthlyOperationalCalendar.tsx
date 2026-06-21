import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Flag, UserRound, Car, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Instructor, Lesson, Student, Vehicle } from '../types';
import { formatDateVN } from './PremiumDateInput';

type MonthlyOperationalCalendarProps = {
  lessons: Lesson[];
  students: Student[];
  instructors: Instructor[];
  vehicles: Vehicle[];
};

type CalendarDay = {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isExamDay: boolean;
  lessons: Lesson[];
};

const EXAM_STORAGE_KEY = 'lhp_center_exam_dates_v1';
const ACTIVE_STATUSES = ['Chờ xác nhận', 'Đã xác nhận', 'Đã hoàn thành'];
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, diff: number): Date => new Date(date.getFullYear(), date.getMonth() + diff, 1);
const addDays = (date: Date, diff: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);

const normalizeExamDates = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => String(item || '').trim()).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item)))).sort();
};

const getDateTitle = (iso: string): string => {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return `${weekdays[date.getDay()]}, ${formatDateVN(iso)}`;
};

const getStudentName = (students: Student[], id: string): string => students.find(s => s.id === id)?.name || 'Chưa rõ học viên';
const getInstructorName = (instructors: Instructor[], id: string): string => instructors.find(i => i.id === id)?.name || 'Chưa gán GV';
const getVehicleName = (vehicles: Vehicle[], id: string): string => {
  const vehicle = vehicles.find(v => v.id === id);
  return vehicle ? `${vehicle.name} (${vehicle.plate})` : 'Chưa gán xe';
};

export const MonthlyOperationalCalendar: React.FC<MonthlyOperationalCalendarProps> = ({ lessons, students, instructors, vehicles }) => {
  const todayIso = toIsoDate(new Date());
  const [monthCursor, setMonthCursor] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [examDates, setExamDates] = useState<string[]>([]);

  useEffect(() => {
    const loadExamDates = () => {
      try {
        setExamDates(normalizeExamDates(JSON.parse(localStorage.getItem(EXAM_STORAGE_KEY) || '[]')));
      } catch {
        setExamDates([]);
      }
    };
    loadExamDates();
    window.addEventListener('storage', loadExamDates);
    return () => window.removeEventListener('storage', loadExamDates);
  }, []);

  const lessonsByDate = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    lessons.forEach(lesson => {
      const list = map.get(lesson.date) || [];
      list.push(lesson);
      map.set(lesson.date, list);
    });
    map.forEach(list => list.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [lessons]);

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const first = startOfMonth(monthCursor);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = addDays(first, -mondayOffset);
    const result: CalendarDay[] = [];

    for (let i = 0; i < 42; i++) {
      const date = addDays(gridStart, i);
      const iso = toIsoDate(date);
      result.push({
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === monthCursor.getMonth(),
        isToday: iso === todayIso,
        isSelected: iso === selectedDate,
        isExamDay: examDates.includes(iso),
        lessons: lessonsByDate.get(iso) || []
      });
    }
    return result;
  }, [monthCursor, selectedDate, todayIso, examDates, lessonsByDate]);

  const selectedLessons = useMemo(() => lessonsByDate.get(selectedDate) || [], [lessonsByDate, selectedDate]);
  const activeLessons = selectedLessons.filter(lesson => ACTIVE_STATUSES.includes(lesson.status));
  const completedCount = selectedLessons.filter(lesson => lesson.status === 'Đã hoàn thành').length;
  const pendingCount = selectedLessons.filter(lesson => lesson.status === 'Chờ xác nhận').length;
  const selectedIsExamDay = examDates.includes(selectedDate);
  const monthLabel = `Tháng ${monthCursor.getMonth() + 1}/${monthCursor.getFullYear()}`;

  return (
    <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
      <div className="rounded-3xl border border-slate-100 bg-white shadow-sm p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-600" /> Lịch tháng vận hành
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-400">Bấm vào từng ngày để xem ca học, lịch thi và việc cần xử lý.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonthCursor(prev => addMonths(prev, -1))} className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-600 active:scale-95">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[110px] text-center text-sm font-black text-slate-900">{monthLabel}</div>
            <button type="button" onClick={() => setMonthCursor(prev => addMonths(prev, 1))} className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-600 active:scale-95">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAY_LABELS.map(label => (
            <div key={label} className="py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
          ))}

          {calendarDays.map(day => {
            const lessonCount = day.lessons.length;
            const dayCompleted = day.lessons.filter(lesson => lesson.status === 'Đã hoàn thành').length;
            const dayPending = day.lessons.filter(lesson => lesson.status === 'Chờ xác nhận').length;
            const dayClass = day.isExamDay
              ? 'border-red-200 bg-red-50 text-red-700 shadow-sm'
              : day.isSelected
                ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-100'
                : day.isToday
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : day.inMonth
                    ? 'border-slate-100 bg-slate-50 text-slate-800 hover:border-blue-200 hover:bg-blue-50'
                    : 'border-slate-50 bg-slate-50/40 text-slate-300';

            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => setSelectedDate(day.iso)}
                className={`min-h-[76px] rounded-2xl border p-2 text-left transition active:scale-[0.98] ${dayClass}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-black">{day.day}</span>
                  {day.isExamDay && <Flag className="h-3.5 w-3.5 text-red-600" />}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {lessonCount > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${day.isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>{lessonCount} ca</span>}
                  {dayCompleted > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${day.isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{dayCompleted} xong</span>}
                  {dayPending > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">{dayPending} chờ</span>}
                  {day.isExamDay && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-700">thi</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 text-[10px] font-black text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700">● Ca học</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">● Đã hoàn thành</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700">● Chờ xác nhận</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-700">● Ngày thi / tự xếp tay</span>
        </div>
      </div>

      <aside className="rounded-3xl border border-slate-100 bg-white shadow-sm p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900">{getDateTitle(selectedDate)}</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">Tổng hợp nhanh toàn bộ thông tin trong ngày.</p>
          </div>
          {selectedIsExamDay && (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-black uppercase text-red-700">Ngày thi • tự xếp tay</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
            <div className="text-[10px] font-black uppercase text-blue-500">Ca học</div>
            <div className="mt-1 text-xl font-black text-blue-700">{selectedLessons.length}</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="text-[10px] font-black uppercase text-emerald-500">Đã xong</div>
            <div className="mt-1 text-xl font-black text-emerald-700">{completedCount}</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
            <div className="text-[10px] font-black uppercase text-amber-500">Cần xử lý</div>
            <div className="mt-1 text-xl font-black text-amber-700">{pendingCount + (selectedIsExamDay ? 1 : 0)}</div>
          </div>
        </div>

        {selectedIsExamDay && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700 leading-relaxed flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Ngày này có lịch thi trung tâm. App không tự xếp lịch học vào đây; anh chủ động xếp tay để đưa học viên đi thi.</span>
          </div>
        )}

        {selectedLessons.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs font-bold text-slate-400">
            Chưa có ca học nào trong ngày này.
          </div>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {selectedLessons.map(lesson => {
              const isDone = lesson.status === 'Đã hoàn thành';
              const isCancelled = lesson.status.includes('nghỉ') || lesson.status === 'Hủy lịch';
              return (
                <div key={lesson.id} className={`rounded-2xl border p-3 ${isCancelled ? 'border-red-100 bg-red-50' : isDone ? 'border-emerald-100 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                      <Clock className="h-4 w-4 text-blue-600" /> {lesson.startTime} - {lesson.endTime}
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${isCancelled ? 'bg-red-100 text-red-700' : isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{lesson.status}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs font-bold text-slate-600">
                    <div className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-slate-400" /> {getStudentName(students, lesson.studentId)} · {lesson.lessonType}</div>
                    <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-slate-400" /> GV: {getInstructorName(instructors, lesson.instructorId)}</div>
                    <div className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5 text-slate-400" /> Xe: {getVehicleName(vehicles, lesson.vehicleId)}</div>
                    {lesson.pickupLocation && <div className="text-slate-400">Đón: {lesson.pickupLocation}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </section>
  );
};
