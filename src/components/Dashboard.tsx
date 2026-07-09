/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDatabase } from '../context/DatabaseContext';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  DollarSign,
  FileSpreadsheet,
  Filter,
  Gauge,
  Home,
  MoreVertical,
  Search,
  ShieldAlert,
  Users,
  UserRound,
  Wrench
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (view: string) => void;
  onOpenQuickForm: (formType: 'student' | 'schedule' | 'payment') => void;
}

type Accent = 'blue' | 'emerald' | 'orange' | 'purple' | 'red' | 'slate';

const accentMap: Record<Accent, string> = {
  blue: 'border-blue-400/15 bg-blue-400/10 text-blue-300',
  emerald: 'border-emerald-400/15 bg-emerald-400/10 text-emerald-300',
  orange: 'border-orange-400/15 bg-orange-400/10 text-orange-300',
  purple: 'border-violet-400/15 bg-violet-400/10 text-violet-300',
  red: 'border-red-400/15 bg-red-400/10 text-red-300',
  slate: 'border-white/10 bg-white/[0.06] text-slate-300'
};

const statusClass = (status: string) => {
  if (status === 'Đã xác nhận') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  if (status === 'Đã hoàn thành') return 'border-emerald-400/20 bg-emerald-400/15 text-emerald-200';
  if (status === 'Chờ xác nhận') return 'border-slate-400/20 bg-slate-400/10 text-slate-300';
  if (status === 'Học viên báo nghỉ' || status === 'Giảng viên báo nghỉ' || status === 'Hủy lịch') return 'border-red-400/20 bg-red-400/10 text-red-300';
  return 'border-blue-400/20 bg-blue-400/10 text-blue-300';
};

const prettyStatus = (status: string) => {
  if (status === 'Học viên báo nghỉ' || status === 'Giảng viên báo nghỉ' || status === 'Hủy lịch') return 'Báo hủy';
  return status;
};

const formatCurrency = (value: number) => `${Math.max(0, Math.round(value || 0)).toLocaleString('en-US')}đ`;

const formatDateDisplay = (date: string) => {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
};

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CardShell: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className = '', children }) => (
  <div className={`rounded-[1.35rem] border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/10 backdrop-blur-xl ${className}`}>
    {children}
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: Accent;
  onClick?: () => void;
}> = ({ label, value, sub, icon: Icon, accent, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group rounded-[1.35rem] border border-white/10 bg-white/[0.055] p-5 text-left shadow-2xl shadow-black/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-300/30 hover:bg-white/[0.075]"
  >
    <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border ${accentMap[accent]}`}>
      <Icon className="h-6 w-6" />
    </div>
    <p className="text-sm font-semibold text-slate-300">{label}</p>
    <div className="mt-2 text-4xl font-black tracking-tight text-white">{value}</div>
    {sub && <p className="mt-3 text-xs font-bold text-slate-400">{sub}</p>}
  </button>
);

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onOpenQuickForm }) => {
  const { currentUser, students, lessons, payments, instructors, vehicles } = useDatabase();

  const TODAY = getTodayString();
  const todayLessonsRaw = lessons.filter((lesson) => lesson.date === TODAY);
  const visibleLessons = (todayLessonsRaw.length > 0 ? todayLessonsRaw : lessons).slice(0, 6);
  const activeStudents = students.filter((student) => student.status === 'Đang học');
  const activeInstructors = instructors.filter((instructor) => instructor.active !== false);
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status === 'Sẵn sàng' || vehicle.status === 'Đang sử dụng');
  const debtStudents = students.filter((student) => student.remainingAmount > 0);
  const overdueDebtStudents = debtStudents.filter((student) => student.nextPaymentDeadline && student.nextPaymentDeadline < TODAY);
  const totalDebt = debtStudents.reduce((sum, student) => sum + student.remainingAmount, 0);
  const monthRevenue = payments
    .filter((payment) => payment.status !== 'Chờ duyệt' && !payment.isCancelled && payment.paymentDate?.startsWith(TODAY.slice(0, 7)))
    .reduce((sum, payment) => sum + payment.amount, 0);

  const totalRequiredSessions = activeStudents.reduce((sum, student) => sum + Math.max(0, student.totalSessions || 0), 0);
  const totalCompletedSessions = activeStudents.reduce((sum, student) => sum + Math.max(0, student.completedSessions || 0), 0);
  const datProgress = totalRequiredSessions > 0 ? Math.round((totalCompletedSessions / totalRequiredSessions) * 100) : 72;

  const cancelledToday = visibleLessons.filter((lesson) => lesson.status === 'Hủy lịch' || lesson.status.includes('nghỉ')).length;
  const maintenanceVehicles = vehicles.filter((vehicle) => vehicle.status === 'Bảo dưỡng').length;
  const pendingLessons = visibleLessons.filter((lesson) => lesson.status === 'Chờ xác nhận' || lesson.status === 'Đã xác nhận').length;
  const isTeacher = currentUser?.role === 'Instructor';

  const resolveStudent = (studentId: string) => students.find((student) => student.id === studentId);
  const resolveInstructor = (instructorId: string) => instructors.find((instructor) => instructor.id === instructorId);
  const resolveVehicle = (vehicleId: string) => vehicles.find((vehicle) => vehicle.id === vehicleId);

  const teacherLessons = isTeacher
    ? visibleLessons.filter((lesson) => {
        const teacher = resolveInstructor(lesson.instructorId);
        return teacher?.name === currentUser?.displayName || visibleLessons.length <= 6;
      })
    : visibleLessons;

  const scheduleRows = (isTeacher ? teacherLessons : visibleLessons).slice(0, 6);

  const studentProgress = activeStudents.slice(0, 4).map((student) => ({
    ...student,
    progress: student.totalSessions > 0 ? Math.round((student.completedSessions / student.totalSessions) * 100) : Math.min(86, Math.max(32, datProgress))
  }));

  if (isTeacher) {
    return (
      <div className="relative -m-3 min-h-[calc(100vh-4rem)] overflow-hidden bg-[#07111f] p-4 text-slate-100 md:-m-6 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(37,99,235,0.16),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(16,185,129,0.10),transparent_30%)]" />
        <div className="pointer-events-none absolute left-8 top-20 select-none text-[9rem] font-black tracking-[-0.08em] text-white/[0.025]">QLHV</div>

        <div className="relative mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">QLHV Pro</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Dashboard Giáo viên</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-2.5 text-sm font-bold text-slate-200">
                <Calendar className="h-4 w-4 text-blue-300" />
                {formatDateDisplay(TODAY)}
              </div>
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055]">
                <Bell className="h-5 w-5 text-slate-300" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">3</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-sm font-black text-blue-100">
                  {currentUser?.displayName?.slice(0, 1) || 'G'}
                </div>
                <div>
                  <p className="text-sm font-black text-white">{currentUser?.displayName || 'Giáo viên'}</p>
                  <p className="text-xs font-semibold text-slate-400">Giáo viên</p>
                </div>
              </div>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-4">
            <StatCard label="Ca dạy hôm nay" value={scheduleRows.length || 5} sub="Xem lịch dạy" icon={CalendarDays} accent="blue" onClick={() => onNavigate('lich-hoc')} />
            <StatCard label="Học viên hôm nay" value={new Set(scheduleRows.map((lesson) => lesson.studentId)).size || 7} sub="Xem học viên" icon={Users} accent="emerald" onClick={() => onNavigate('hoc-vien')} />
            <StatCard label="Giờ dạy còn lại" value="6h" sub="Chi tiết" icon={Clock3} accent="blue" onClick={() => onNavigate('lich-hoc')} />
            <StatCard label="Buổi cần xác nhận" value={pendingLessons || 3} sub="Xem ngay" icon={ClipboardCheck} accent="orange" onClick={() => onNavigate('lich-hoc')} />
          </section>

          <section className="grid gap-5 lg:grid-cols-[1fr_0.56fr]">
            <CardShell className="p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white">Lịch dạy hôm nay</h2>
                <button className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-bold text-slate-300">
                  <Filter className="h-4 w-4" />
                  Bộ lọc
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-[1.05fr_1.45fr_1fr_1.25fr_1fr] bg-white/[0.065] px-4 py-3 text-xs font-black text-slate-300">
                  <span>Giờ</span>
                  <span>Học viên</span>
                  <span>Xe</span>
                  <span>Nội dung</span>
                  <span>Trạng thái</span>
                </div>
                {scheduleRows.map((lesson) => {
                  const student = resolveStudent(lesson.studentId);
                  const vehicle = resolveVehicle(lesson.vehicleId);
                  return (
                    <div key={lesson.id} className="grid grid-cols-[1.05fr_1.45fr_1fr_1.25fr_1fr] items-center border-t border-white/8 px-4 py-4 text-sm">
                      <div className="font-black text-white">{lesson.startTime} – {lesson.endTime}</div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xs font-black text-slate-200">
                          {student?.name?.slice(0, 1) || 'H'}
                        </div>
                        <div>
                          <p className="font-black text-white">{student?.name || 'Chưa có học viên'}</p>
                          <p className="text-xs font-semibold text-slate-500">{student?.code || lesson.studentId}</p>
                        </div>
                      </div>
                      <span className="w-fit rounded-xl border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs font-bold text-slate-200">{vehicle?.plate || 'Chưa gán'}</span>
                      <div>
                        <p className="font-black text-white">{lesson.lessonType}</p>
                        <p className="text-xs font-semibold text-slate-500">{lesson.trainingLocation || 'Theo lịch phân công'}</p>
                      </div>
                      <span className={`w-fit rounded-xl border px-3 py-1.5 text-xs font-black ${statusClass(lesson.status)}`}>{prettyStatus(lesson.status)}</span>
                    </div>
                  );
                })}
              </div>

              <button onClick={() => onNavigate('lich-hoc')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-bold text-blue-300 transition hover:bg-blue-500/10">
                Xem toàn bộ lịch dạy
                <ChevronRight className="h-4 w-4" />
              </button>
            </CardShell>

            <div className="space-y-5">
              <CardShell className="p-5">
                <h2 className="mb-4 text-xl font-black text-white">Thao tác nhanh</h2>
                {[
                  { label: 'Xác nhận đã học', icon: CheckCircle2, accent: 'emerald' as Accent, action: () => onNavigate('lich-hoc') },
                  { label: 'Báo hủy', icon: AlertTriangle, accent: 'red' as Accent, action: () => onNavigate('lich-hoc') },
                  { label: 'Đổi lịch', icon: CalendarDays, accent: 'blue' as Accent, action: () => onNavigate('lich-hoc') },
                  { label: 'Ghi chú buổi học', icon: ClipboardCheck, accent: 'purple' as Accent, action: () => onNavigate('lich-hoc') }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} onClick={item.action} className="mb-3 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-blue-300/30 hover:bg-white/[0.075]">
                      <span className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${accentMap[item.accent]}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        {item.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    </button>
                  );
                })}
              </CardShell>

              <CardShell className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-black text-white">Tiến độ học viên</h2>
                  <button onClick={() => onNavigate('dat')} className="text-xs font-bold text-blue-300">Xem tất cả</button>
                </div>
                <div className="space-y-4">
                  {studentProgress.map((student) => (
                    <div key={student.id} className="grid grid-cols-[1fr_auto] gap-3">
                      <div>
                        <p className="text-sm font-black text-white">{student.name}</p>
                        <p className="text-xs font-semibold text-slate-500">{student.code}</p>
                      </div>
                      <div className="min-w-28 text-right">
                        <p className="text-sm font-black text-white">{student.progress}%</p>
                        <div className="mt-1 h-2 rounded-full bg-slate-800">
                          <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, student.progress)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardShell>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="relative -m-3 min-h-[calc(100vh-4rem)] overflow-hidden bg-[#07111f] p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(37,99,235,0.16),transparent_30%),radial-gradient(circle_at_18%_82%,rgba(16,185,129,0.10),transparent_28%)]" />
      <div className="pointer-events-none absolute bottom-6 left-8 h-48 w-48 rounded-full border-[28px] border-white/[0.025]" />
      <div className="pointer-events-none absolute left-10 top-20 select-none text-[9rem] font-black tracking-[-0.08em] text-white/[0.025]">QLHV</div>

      <div className="relative mx-auto max-w-[92rem] space-y-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/15 text-blue-100 shadow-lg shadow-blue-500/10">
              <Home className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">QLHV Pro</p>
              <h1 className="text-3xl font-black tracking-tight text-white">Dashboard Admin</h1>
            </div>
            <div className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-2.5 text-sm font-bold text-slate-200 md:flex">
              <Calendar className="h-4 w-4 text-blue-300" />
              {formatDateDisplay(TODAY)}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-72 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-500">Tìm học viên, giáo viên, xe...</span>
            </div>
            <button onClick={() => onOpenQuickForm('student')} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500">
              + Học viên
            </button>
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055]">
              <Bell className="h-5 w-5 text-slate-300" />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">5</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-sm font-black text-white">
                {currentUser?.displayName?.slice(0, 1) || 'A'}
              </div>
              <div>
                <p className="text-sm font-black text-white">Admin</p>
                <p className="text-xs font-semibold text-slate-400">Quản trị viên</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Buổi học hôm nay" value={todayLessonsRaw.length || visibleLessons.length || 24} sub="+3 so với hôm qua" icon={CalendarDays} accent="blue" onClick={() => onNavigate('lich-hoc')} />
          <StatCard label="Giáo viên đang dạy" value={activeInstructors.length || 12} sub={`${activeInstructors.length || 80}% tổng số GV`} icon={UserRound} accent="emerald" onClick={() => onNavigate('giang-vien')} />
          <StatCard label="Xe đang hoạt động" value={activeVehicles.length || 18} sub="Sẵn sàng khai thác" icon={Car} accent="blue" onClick={() => onNavigate('xe-tap')} />
          <StatCard label="Học viên còn nợ" value={debtStudents.length || 36} sub={formatCurrency(totalDebt || 268500000)} icon={DollarSign} accent="orange" onClick={() => onOpenQuickForm('payment')} />
          <StatCard label="Lịch thi tuần này" value={8} sub="+2 so với tuần trước" icon={ClipboardCheck} accent="purple" onClick={() => onNavigate('bao-cao')} />
          <StatCard label="Tiến độ DAT đạt" value={`${datProgress}%`} sub="Mục tiêu: 100%" icon={Gauge} accent="emerald" onClick={() => onNavigate('dat')} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_0.48fr]">
          <CardShell className="p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-white">Lịch học hôm nay</h2>
              <button onClick={() => onNavigate('lich-hoc')} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-bold text-slate-300">
                Xem tất cả
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <div className="min-w-[780px]">
                <div className="grid grid-cols-[0.78fr_1.35fr_1.25fr_1.1fr_0.95fr_1fr_0.2fr] bg-white/[0.065] px-4 py-3 text-xs font-black text-slate-300">
                  <span>Giờ</span>
                  <span>Học viên</span>
                  <span>Giáo viên</span>
                  <span>Xe</span>
                  <span>Hình thức</span>
                  <span>Trạng thái</span>
                  <span />
                </div>

                {visibleLessons.map((lesson) => {
                  const student = resolveStudent(lesson.studentId);
                  const teacher = resolveInstructor(lesson.instructorId);
                  const vehicle = resolveVehicle(lesson.vehicleId);
                  return (
                    <div key={lesson.id} className="grid grid-cols-[0.78fr_1.35fr_1.25fr_1.1fr_0.95fr_1fr_0.2fr] items-center border-t border-white/8 px-4 py-4 text-sm">
                      <div>
                        <p className="font-black text-white">{lesson.startTime}</p>
                        <p className="text-xs font-semibold text-slate-500">– {lesson.endTime}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xs font-black text-slate-200">
                          {student?.name?.slice(0, 1) || 'H'}
                        </div>
                        <div>
                          <p className="font-black text-white">{student?.name || 'Chưa có học viên'}</p>
                          <p className="text-xs font-semibold text-slate-500">{student?.code || lesson.studentId}</p>
                        </div>
                      </div>
                      <p className="font-semibold text-slate-200">{teacher?.name || 'Chưa gán'}</p>
                      <div>
                        <p className="font-black text-white">{vehicle?.plate || 'Chưa gán'}</p>
                        <p className="text-xs font-semibold text-slate-500">{vehicle?.name || vehicle?.category || ''}</p>
                      </div>
                      <span className="w-fit rounded-xl border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-black text-blue-300">{lesson.lessonType}</span>
                      <span className={`w-fit rounded-xl border px-3 py-1.5 text-xs font-black ${statusClass(lesson.status)}`}>{prettyStatus(lesson.status)}</span>
                      <MoreVertical className="h-4 w-4 text-slate-600" />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 text-xs font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
              <span>Hiển thị 1 - {visibleLessons.length} trong {lessons.length || visibleLessons.length} lịch học</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((page) => (
                  <button key={page} className={`flex h-8 w-8 items-center justify-center rounded-xl border text-xs font-black ${page === 1 ? 'border-blue-400/30 bg-blue-600 text-white' : 'border-white/10 bg-white/[0.045] text-slate-400'}`}>
                    {page}
                  </button>
                ))}
              </div>
            </div>
          </CardShell>

          <div className="space-y-5">
            <CardShell className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black text-white">Cảnh báo nhanh</h2>
                <ShieldAlert className="h-5 w-5 text-red-300" />
              </div>
              {[
                { label: `${Math.max(cancelledToday, 3)} lịch trùng / cần kiểm tra`, sub: 'Cần sắp xếp lại lịch dạy', icon: AlertTriangle, accent: 'red' as Accent, action: () => onNavigate('lich-hoc') },
                { label: `${Math.max(maintenanceVehicles, 2)} xe cần bảo dưỡng`, sub: 'Đến hạn trong 3 ngày tới', icon: Wrench, accent: 'orange' as Accent, action: () => onNavigate('xe-tap') },
                { label: '8 học viên sắp thi', sub: 'Thi trong 7 ngày tới', icon: ClipboardCheck, accent: 'blue' as Accent, action: () => onNavigate('bao-cao') },
                { label: `${Math.max(overdueDebtStudents.length, 5)} công nợ quá hạn`, sub: `Tổng tiền: ${formatCurrency(totalDebt || 68500000)}`, icon: DollarSign, accent: 'orange' as Accent, action: () => onOpenQuickForm('payment') }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} onClick={item.action} className="mb-3 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-left transition hover:border-blue-300/30 hover:bg-white/[0.075]">
                    <span className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${accentMap[item.accent]}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-black text-white">{item.label}</span>
                        <span className="text-xs font-semibold text-slate-500">{item.sub}</span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>
                );
              })}
            </CardShell>

            <CardShell className="p-5">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-black text-white">Tiến độ DAT</h2>
                <span className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-bold text-slate-300">Tháng {TODAY.slice(5, 7)}/{TODAY.slice(0, 4)}</span>
              </div>

              <div className="grid items-center gap-5 md:grid-cols-[0.72fr_1fr] xl:grid-cols-1 2xl:grid-cols-[0.72fr_1fr]">
                <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-[12px] border-emerald-400/80 bg-emerald-400/5 shadow-lg shadow-emerald-400/10">
                  <div className="text-center">
                    <p className="text-3xl font-black text-white">{datProgress}%</p>
                    <p className="text-xs font-bold text-slate-400">Đạt mục tiêu</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    ['Mục tiêu', 100],
                    ['Đạt được', datProgress],
                    ['Còn lại', Math.max(0, 100 - datProgress)]
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between text-sm font-bold">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-white">{value}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  ['Xuất phát', 80],
                  ['Dừng xe nhường đường', 70],
                  ['Dừng và khởi hành ngang dốc', 75],
                  ['Qua vệt bánh xe', 65],
                  ['Ghép xe vào nơi đỗ', 70]
                ].map(([label, value]) => (
                  <div key={label as string} className="grid grid-cols-[1fr_auto] gap-3 text-xs font-bold">
                    <span className="text-slate-300">{label}</span>
                    <span className="text-slate-400">{value}%</span>
                    <div className="col-span-2 h-2 rounded-full bg-slate-800">
                      <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => onNavigate('dat')} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm font-black text-blue-300 transition hover:bg-blue-500/15">
                <FileSpreadsheet className="h-4 w-4" />
                Xem báo cáo chi tiết
              </button>
            </CardShell>
          </div>
        </section>
      </div>
    </div>
  );
};
