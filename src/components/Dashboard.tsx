/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Student, Lesson, Payment } from '../types';
import { checkLessonConflicts } from '../services/scheduling';
import {
  Calendar,
  Users,
  TrendingUp,
  DollarSign,
  Clock,
  AlertTriangle,
  UserCheck,
  PlusCircle,
  FileSpreadsheet,
  CheckCircle,
  ChevronRight,
  ShieldAlert,
  BellRing,
  Phone,
  Edit3,
  X,
  MapPin,
  CalendarDays,
  BookOpen,
  Lightbulb,
  Check,
  HelpCircle,
  Car
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (view: string) => void;
  onOpenQuickForm: (formType: 'student' | 'schedule' | 'payment') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onOpenQuickForm }) => {
  const {
    currentUser,
    students,
    lessons,
    payments,
    instructors,
    vehicles,
    updateLesson
  } = useDatabase();

  const [attendanceView, setAttendanceView] = useState(false);

  // States for Quick Start Guide
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [guideCompletedSteps, setGuideCompletedSteps] = useState<number[]>([]);

  const toggleStepCompleted = (stepId: number) => {
    setGuideCompletedSteps(prev =>
      prev.includes(stepId) ? prev.filter(id => id !== stepId) : [...prev, stepId]
    );
  };

  // States for fast actions on mobile layout
  const [rescheduleLesson, setRescheduleLesson] = useState<Lesson | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const [notesLesson, setNotesLesson] = useState<Lesson | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [notesSuccess, setNotesSuccess] = useState('');

  // Customizable widgets configuration state (loaded from local storage or defaults)
  const [enabledWidgets, setEnabledWidgets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_widgets_v2');
      return saved ? JSON.parse(saved) : ['kpis', 'today-kpis', 'todayLessons', 'overdueLearning', 'recentActivity', 'conflicts', 'quickGuide'];
    } catch {
      return ['kpis', 'today-kpis', 'todayLessons', 'overdueLearning', 'recentActivity', 'conflicts', 'quickGuide'];
    }
  });
  const [showConfigModal, setShowConfigModal] = useState(false);

  const saveWidgets = (widgets: string[]) => {
    setEnabledWidgets(widgets);
    localStorage.setItem('dashboard_widgets_v2', JSON.stringify(widgets));
  };

  // Constants
  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const TODAY = getTodayString();

  // 1. Calculate active statistics
  // Today's lessons
  const todayLessons = lessons.filter(l => l.date === TODAY);

  // Students studying
  const activeStudents = students.filter(s => s.status === 'Đang học');

  // Revenue collected this current simulated month
  const currentMonthStr = TODAY.substring(0, 7);
  const juneRevenue = payments
    .filter(p => p.status === 'Đã duyệt' && !p.isCancelled && p.paymentDate.startsWith(currentMonthStr))
    .reduce((sum, p) => sum + p.amount, 0);

  // Total student debt
  const totalDebt = students.reduce((sum, s) => sum + s.remainingAmount, 0);

  // Non-booked in 7 days or more (last completed lesson > 7 days or no lessons grouped)
  const inactiveStudentsCount = students.filter(s => {
    if (s.status !== 'Đang học') return false;
    const studentLessons = lessons.filter(l => l.studentId === s.id && l.status === 'Đã hoàn thành');
    if (studentLessons.length === 0) return true; // Never studied
    // Sort by date descending
    const lastDateStr = studentLessons.reduce((latest, l) => l.date > latest ? l.date : latest, '1970-01-01');
    const diffMs = new Date(TODAY).getTime() - new Date(lastDateStr).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
  }).length;

  // Overdue students lists - 14 days or more without any class
  const overdueStudentsList = students.filter(s => {
    if (s.status !== 'Đang học') return false;
    const studentLessons = lessons.filter(l => l.studentId === s.id && l.status !== 'Hủy lịch' && l.status !== 'Học viên báo nghỉ' && l.status !== 'Giảng viên báo nghỉ');
    if (studentLessons.length === 0) return true; // Never scheduled any non-cancelled lesson
    
    const latestDateStr = studentLessons.reduce((latest, l) => l.date > latest ? l.date : latest, '1970-01-01');
    const diffMs = new Date(TODAY).getTime() - new Date(latestDateStr).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 14;
  });

  // Helpers and KPI Computations
  const getMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  // KPI 1: Tổng số giờ lái trong tháng (June 2026)
  const completedJuneLessons = lessons.filter(
    l => l.status === 'Đã hoàn thành' && l.date.startsWith('2026-06')
  );
  const totalJuneMinutes = completedJuneLessons.reduce((sum, l) => {
    try {
      const s = getMinutes(l.startTime);
      const e = getMinutes(l.endTime);
      return sum + Math.max(0, e - s);
    } catch (err) {
      return sum;
    }
  }, 0);
  const totalJuneDrivingHours = Math.round((totalJuneMinutes / 60) * 10) / 10;

  // KPI 2: Tỷ lệ học viên đỗ
  const passedStudents = students.filter(s => s.status === 'Đã thi');
  const totalGraduatedOrExam = students.filter(s => s.status === 'Đã thi' || s.status === 'Đã hoàn thành');
  const studentPassingRate = totalGraduatedOrExam.length > 0
    ? Math.round((passedStudents.length / totalGraduatedOrExam.length) * 100)
    : 92; // Fallback standard

  // KPI 3: Số lượng ca trống trong 7 ngày tới
  const standardShifts = [
    { start: '08:00', end: '10:00' },
    { start: '10:00', end: '12:00' },
    { start: '14:00', end: '16:00' },
    { start: '16:00', end: '18:00' }
  ];

  const getUpcomingDays = (startDateStr: string) => {
    const list: string[] = [];
    const base = new Date(startDateStr);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      list.push(`${yyyy}-${mm}-${dd}`);
    }
    return list;
  };

  const upcoming7Days = getUpcomingDays(TODAY);
  let totalSlotsCalculated = 0;
  let takenSlotsCalculated = 0;

  instructors.forEach(inst => {
    upcoming7Days.forEach(date => {
      standardShifts.forEach(shift => {
        totalSlotsCalculated++;
        const isOccupied = lessons.some(l => {
          if (l.date !== date || l.instructorId !== inst.id) return false;
          if (l.status === 'Học viên báo nghỉ' || l.status === 'Giảng viên báo nghỉ' || l.status === 'Hủy lịch') return false;
          
          const sA = getMinutes(l.startTime);
          const eA = getMinutes(l.endTime);
          const sB = getMinutes(shift.start);
          const eB = getMinutes(shift.end);
          return sA < eB && sB < eA;
        });
        if (isOccupied) {
          takenSlotsCalculated++;
        }
      });
    });
  });

  const emptySlotsCount = totalSlotsCalculated - takenSlotsCalculated;

  // Compute conflicts list
  // Lessons on the same date where student, instructor or vehicle overlap and are active
  const conflictedLessons: { lessonA: Lesson; reason: string }[] = [];
  const activeLessons = lessons.filter(l => l.status !== 'Học viên báo nghỉ' && l.status !== 'Giảng viên báo nghỉ' && l.status !== 'Hủy lịch');
  
  const processedConflictPairs = new Set<string>();

  activeLessons.forEach((lA, idx) => {
    for (let i = idx + 1; i < activeLessons.length; i++) {
      const lB = activeLessons[i];
      if (lA.date === lB.date) {
        // Simple check overlap
        const toMin = (t: string) => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };
        const sA = toMin(lA.startTime);
        const eA = toMin(lA.endTime);
        const sB = toMin(lB.startTime);
        const eB = toMin(lB.endTime);
        const overlaps = sA < eB && sB < eA;

        if (overlaps) {
          let reason = '';
          if (lA.studentId === lB.studentId) {
            reason = `HV trùng lịch (${lA.startTime} - ${lA.endTime})`;
          } else if (lA.instructorId === lB.instructorId) {
            reason = `Giảng viên phân trùng giờ dạy (${lA.startTime} - ${lA.endTime})`;
          } else if (lA.vehicleId === lB.vehicleId) {
            reason = `Xe tập ${vehicles.find(v => v.id === lA.vehicleId)?.name || 'đại trà'} trùng lịch sử dụng (${lA.startTime} - ${lA.endTime})`;
          }

          if (reason && !processedConflictPairs.has(lA.id)) {
            conflictedLessons.push({ lessonA: lA, reason });
            processedConflictPairs.add(lA.id);
          }
        }
      }
    }
  });

  // Tuition deadlines count
  const overdueTuitions = students.filter(s => {
    if (s.remainingAmount <= 0) return false;
    return s.nextPaymentDeadline < TODAY;
  });

  // Recent payments
  const recentPayments = payments.slice(0, 4);

  // Students requiring tuition reminder (debt > 5M or overdue)
  const reminderStudents = students.filter(s => s.remainingAmount >= 5000000 || s.nextPaymentDeadline < TODAY).slice(0, 4);

  const handleQuickAttendance = (lessId: string, attStatus: 'Có mặt' | 'Vắng') => {
    updateLesson(lessId, {
      attendanceStatus: attStatus,
      status: attStatus === 'Có mặt' ? 'Đã hoàn thành' : 'Đã xác nhận'
    });
  };

  const renderLessonCard = (les: Lesson) => {
    const student = students.find(s => s.id === les.studentId);
    const teacher = instructors.find(i => i.id === les.instructorId);
    const car = vehicles.find(v => v.id === les.vehicleId);

    let statusBg = 'bg-blue-50 text-blue-700 border-blue-100';
    if (les.status === 'Đã hoàn thành') statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (les.status.includes('nghỉ') || les.status === 'Hủy lịch') statusBg = 'bg-red-50 text-red-700 border-red-100';

    let attColor = 'text-slate-400 border-slate-200 bg-slate-50';
    if (les.attendanceStatus === 'Có mặt') attColor = 'text-emerald-700 border-emerald-200 bg-emerald-50';
    if (les.attendanceStatus === 'Vắng') attColor = 'text-red-700 border-red-200 bg-red-50';

    return (
      <div key={les.id} className="bg-white rounded-3xl border border-slate-150 shadow-xs p-4.5 space-y-4 text-left">
        {/* Time and Status Badge */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4.5 w-4.5 text-blue-600 shrink-0" />
            <span className="text-sm font-black text-slate-800">{les.startTime} - {les.endTime}</span>
            <span className="text-[10px] text-slate-400 font-medium">({new Date(les.date).toLocaleDateString('vi-VN')})</span>
          </div>
          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${statusBg}`}>
            {les.status}
          </span>
        </div>

        {/* Student Details */}
        <div className="space-y-1">
          <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">{student?.name}</h4>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-slate-500 font-medium">
            <span>Hạng: <strong className="text-slate-700">{student?.licenseClass}</strong></span>
            <span className="text-slate-200">•</span>
            <span>GV: <strong className="text-slate-700">{teacher?.name || 'Chưa gán'}</strong></span>
            <span className="text-slate-200">•</span>
            <span>Xe: <strong className="text-slate-700">{car?.name || 'Chưa gán'} ({car?.plate || 'AT'})</strong></span>
          </div>
        </div>

        {/* Pickup location */}
        {(les.pickupLocation || les.trainingLocation) && (
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-xs text-slate-650 space-y-1.5 font-semibold">
            {les.pickupLocation && (
              <div className="flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>Đón: {les.pickupLocation}</span>
              </div>
            )}
            {les.trainingLocation && (
              <div className="flex items-start gap-1.5">
                <span className="text-slate-400 font-bold text-xs">🎯</span>
                <span>Bãi tập: {les.trainingLocation}</span>
              </div>
            )}
          </div>
        )}

        {/* Review outcomes display */}
        {(les.resultNote || les.notes) && (
          <div className="border-t border-dashed border-slate-150 pt-3 text-[11px] text-slate-500 font-medium leading-relaxed">
            {les.notes && <p className="text-slate-400"><strong className="text-slate-500 font-semibold">Ghi chú:</strong> {les.notes}</p>}
            {les.resultNote && <p className="text-indigo-600 mt-1"><strong className="text-slate-550 font-semibold">Thầy nhận xét:</strong> {les.resultNote}</p>}
          </div>
        )}

        {/* Attendance indication if already marked and not 'Chưa điểm danh' */}
        {les.attendanceStatus !== 'Chưa điểm danh' && (
          <div className={`py-1.5 px-3 rounded-xl text-xs font-black border flex items-center gap-1.5 ${attColor}`}>
            <span className="h-2 w-2 rounded-full bg-current shrink-0" />
            <span>Điểm danh: {les.attendanceStatus === 'Có mặt' ? 'HỌC VIÊN CÓ MẶT THAM GIA' : 'HỌC VIÊN VẮNG MẶT'}</span>
          </div>
        )}

        {/* touch targeted action bar */}
        <div className="grid grid-cols-5 gap-1.5 pt-3 border-t border-slate-150">
          
          {/* 1. Gọi điện */}
          <a
            href={student?.phone ? `tel:${student.phone}` : '#'}
            onClick={(e) => {
              if (!student?.phone) {
                e.preventDefault();
                alert('Không gán số điện thoại học viên.');
              }
            }}
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-105 active:scale-95 transition-all text-[9px] sm:text-[10px] font-black cursor-pointer min-h-[50px]"
          >
            <Phone className="h-4.5 w-4.5 mb-1 shrink-0" />
            <span>Gọi điện</span>
          </a>

          {/* 2. Điểm danh */}
          <button
            type="button"
            onClick={() => {
              let nextAtt: 'Có mặt' | 'Vắng' | 'Chưa điểm danh' = 'Có mặt';
              if (les.attendanceStatus === 'Có mặt') nextAtt = 'Vắng';
              else if (les.attendanceStatus === 'Vắng') nextAtt = 'Chưa điểm danh';
              
              updateLesson(les.id, { 
                attendanceStatus: nextAtt,
                status: nextAtt === 'Có mặt' ? 'Đã hoàn thành' : 'Đã xác nhận' 
              });
            }}
            className={`flex flex-col items-center justify-center p-2 rounded-2xl hover:bg-slate-100 active:scale-95 transition-all text-[9px] sm:text-[10px] font-black cursor-pointer min-h-[50px] border ${les.attendanceStatus !== 'Chưa điểm danh' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-700'}`}
          >
            <UserCheck className="h-4.5 w-4.5 mb-1 shrink-0" />
            <span>{les.attendanceStatus !== 'Chưa điểm danh' ? les.attendanceStatus : 'Dự lớp'}</span>
          </button>

          {/* 3. Hoàn thành */}
          <button
            type="button"
            onClick={() => {
              updateLesson(les.id, { 
                status: 'Đã hoàn thành',
                attendanceStatus: 'Có mặt'
              });
              alert('Đã cập nhật hoàn thành buổi học và điểm danh học viên!');
            }}
            className={`flex flex-col items-center justify-center p-2 rounded-2xl active:scale-95 transition-all text-[9px] sm:text-[10px] font-black cursor-pointer min-h-[50px] border ${les.status === 'Đã hoàn thành' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 border-slate-100 text-slate-705 hover:bg-slate-100'}`}
          >
            <CheckCircle className="h-4.5 w-4.5 mb-1 shrink-0" />
            <span>Xong</span>
          </button>

          {/* 4. Đổi lịch */}
          <button
            type="button"
            onClick={() => {
              setRescheduleLesson(les);
              setNewDate(les.date);
              setNewStart(les.startTime);
              setNewEnd(les.endTime);
            }}
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all text-[9px] sm:text-[10px] font-black cursor-pointer min-h-[50px]"
          >
            <CalendarDays className="h-4.5 w-4.5 mb-1 shrink-0" />
            <span>Đổi lịch</span>
          </button>

          {/* 5. Ghi chú */}
          <button
            type="button"
            onClick={() => {
              setNotesLesson(les);
              setNewNoteText(les.resultNote || '');
              setNotesSuccess('');
            }}
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all text-[9px] sm:text-[10px] font-black cursor-pointer min-h-[50px]"
          >
            <Edit3 className="h-4.5 w-4.5 mb-1 shrink-0" />
            <span>Nhận xét</span>
          </button>

        </div>
      </div>
    );
  };

  return (
    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-6">
      {/* Header Greeting */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Xin chào, {currentUser?.displayName}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-blue-200 bg-blue-100/50 text-blue-700">
              {currentUser?.role === 'Admin' ? 'Quản lý' : currentUser?.role === 'Staff' ? 'Tuyển sinh' : 'Giảng viên'}
            </span>
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Hôm nay: <strong className="text-slate-700">
              {(() => {
                try {
                  const parts = TODAY.split('-');
                  const year = parseInt(parts[0], 10);
                  const month = parseInt(parts[1], 10) - 1;
                  const day = parseInt(parts[2], 10);
                  const d = new Date(year, month, day);
                  const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                  const dayOfWeek = weekdays[d.getDay()];
                  return `${dayOfWeek}, ngày ${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
                } catch {
                  return TODAY;
                }
              })()}
            </strong> (Thời gian thực hệ thống)
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onOpenQuickForm('student')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all shadow-sm"
          >
            <PlusCircle className="h-4 w-4" />
            Đăng ký học viên
          </button>
          <button
            onClick={() => onOpenQuickForm('schedule')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-950 text-white cursor-pointer transition-all shadow-sm"
          >
            <Calendar className="h-4 w-4" />
            Xếp lịch dắt tay
          </button>
          <button
            onClick={() => onNavigate('auto-schedule')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-all shadow-sm"
          >
            <Clock className="h-4 w-4" />
            Xếp lịch tự động
          </button>
          <button
            onClick={() => onOpenQuickForm('payment')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs bg-orange-500 hover:bg-orange-600 text-white cursor-pointer transition-all shadow-sm"
          >
            <DollarSign className="h-4 w-4" />
            Thu học phí
          </button>
          
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer transition-all shadow-sm"
          >
            ⚙️ Tùy biến trang chủ
          </button>
        </div>
      </div>

      {/* MOBILE-ONLY TODAY'S LESSONS RENDERED FIRST */}
      <div className="block lg:hidden space-y-4 text-center">
        <div className="bg-white rounded-3xl border border-slate-150 p-4 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                📅 LỊCH HỌC HÔM NAY ({TODAY})
              </h2>
              <p className="text-[10px] text-slate-400 font-medium text-left">Tiện ích một chạm tích hợp cho giảng viên</p>
            </div>
            <span className="bg-blue-100 text-blue-700 font-extrabold text-[10px] px-2.5 py-1 rounded-full">
              {todayLessons.length} ca dạy
            </span>
          </div>

          {todayLessons.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs font-semibold italic">
              Thầy không có ca dạy nào được lên lịch hôm nay.
            </div>
          ) : (
            <div className="space-y-4">
              {todayLessons.sort((a,b) => a.startTime.localeCompare(b.startTime)).map((les) => renderLessonCard(les))}
            </div>
          )}
        </div>
      </div>

      {/* KPI Overviews */}
      {enabledWidgets.includes('kpis') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-start justify-between">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ca học hôm nay</span>
              <div className="text-2xl font-black text-slate-800">{todayLessons.length} buổi</div>
              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                Điểm danh: {todayLessons.filter(l => l.attendanceStatus !== 'Chưa điểm danh').length}/{todayLessons.length}
              </span>
            </div>
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-2xl">
              <Calendar className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-start justify-between">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Học viên đang học</span>
              <div className="text-2xl font-black text-slate-800">{activeStudents.length} học viên</div>
              <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                Chưa đặt lịch (7 ngày): {inactiveStudentsCount}
              </span>
            </div>
            <div className="bg-purple-50 text-purple-600 p-2.5 rounded-2xl">
              <Users className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-start justify-between">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Doanh thu tháng 6</span>
              <div className="text-2xl font-black text-emerald-600">
                {juneRevenue.toLocaleString('vi-VN')} ₫
              </div>
              <span className="text-[10px] font-bold text-slate-500">
                Cập nhật mới nhất hôm nay
              </span>
            </div>
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-2xl">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-start justify-between">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tổng công nợ cần thu</span>
              <div className="text-2xl font-black text-red-600">
                {totalDebt.toLocaleString('vi-VN')} ₫
              </div>
              <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                Quá hạn đóng phí: {overdueTuitions.length} HV
              </span>
            </div>
            <div className="bg-red-50 text-red-600 p-2.5 rounded-2xl">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* SECONDARY ROW: PERFORMANCE MEASURES (KPIs) */}
      {enabledWidgets.includes('today-kpis') && (
        <div id="performance-kpis-container" className="bg-slate-50/50 rounded-3xl p-5 border border-slate-150 space-y-4 text-left">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div>
              <h2 id="kpi-section-title" className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                📊 CHỈ SỐ ĐO LƯỜNG HIỆU SUẤT & CA DẠY (KPI)
              </h2>
              <p className="text-[10.5px] text-slate-400 font-bold mt-0.5">Chỉ số vận hành cốt lõi tổng hợp tự động từ cơ sở dữ liệu hiện có</p>
            </div>
            <span className="bg-blue-100 text-blue-700 font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider self-start sm:self-auto">
              Hệ thống báo cáo tháng 6
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Tổng số giờ lái trong tháng */}
            <div id="kpi-card-driving-hours" className="bg-white p-4.5 rounded-2xl border border-slate-150 shadow-xs flex items-start justify-between hover:shadow-md transition-all duration-300">
              <div className="space-y-1.5">
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Số giờ lái trong tháng</span>
                <div className="text-2xl font-black text-slate-900">{totalJuneDrivingHours} giờ</div>
                <p className="text-[10.5px] text-slate-500 font-semibold leading-relaxed">
                  Tích lũy từ <strong className="text-slate-700">{completedJuneLessons.length}</strong> ca tập thực hành đã hoàn thành của tháng này.
                </p>
              </div>
              <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl shrink-0">
                <Clock className="h-5 w-5" />
              </div>
            </div>

            {/* Card 2: Tỷ lệ học viên đỗ */}
            <div id="kpi-card-passing-rate" className="bg-white p-4.5 rounded-2xl border border-slate-150 shadow-xs flex items-start justify-between hover:shadow-md transition-all duration-300">
              <div className="space-y-1.5">
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Tỷ lệ học viên đỗ</span>
                <div className="text-2xl font-black text-emerald-600">{studentPassingRate}%</div>
                <p className="text-[10.5px] text-slate-500 font-semibold leading-relaxed">
                  Tính trên <strong className="text-emerald-700">{passedStudents.length}</strong> học viên thi đỗ sát hạch trong tổng số <strong className="text-slate-700">{totalGraduatedOrExam.length}</strong> học viên tốt nghiệp/đăng ký thi.
                </p>
              </div>
              <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl shrink-0">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>

            {/* Card 3: Số lượng ca trống */}
            <div id="kpi-card-empty-slots" className="bg-white p-4.5 rounded-2xl border border-slate-150 shadow-xs flex items-start justify-between hover:shadow-md transition-all duration-300">
              <div className="space-y-1.5">
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Số lượng ca trống</span>
                <div className="text-2xl font-black text-indigo-600">{emptySlotsCount} ca</div>
                <p className="text-[10.5px] text-slate-500 font-semibold leading-relaxed">
                  Còn trống trong 7 ngày tới (quét <strong className="text-slate-700">{totalSlotsCalculated}</strong> ca lý thuyết/thực hành của toàn bộ giảng viên).
                </p>
              </div>
              <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl shrink-0">
                <CalendarDays className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK START GUIDE FOR NEW TEACHERS/USERS */}
      {enabledWidgets.includes('quickGuide') && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden text-left font-sans" id="quick-start-guide">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 bg-gradient-to-r from-blue-50/50 to-indigo-50/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight flex flex-wrap items-center gap-1.5 font-sans">
                Hướng dẫn sử dụng nhanh cho Giáo viên mới
                <span className="bg-indigo-100 text-indigo-700 text-[10px] uppercase px-2 py-0.5 rounded font-black tracking-wider border border-indigo-200">
                  bắt đầu dễ dàng
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-semibold mt-0.5 font-sans">
                Các bước tinh gọn từ việc ghi danh, lên lịch tập lái, chấm buổi học tới giám sát an toàn phương tiện
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className="text-xs font-black text-blue-600 hover:text-blue-700 hover:bg-white bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-xl cursor-pointer transition-all select-none self-end sm:self-auto flex items-center gap-1 shrink-0 font-sans"
          >
            {isGuideOpen ? 'Thu gọn' : 'Hiện hướng dẫn'}
          </button>
        </div>

        {isGuideOpen && (
          <div className="p-5 space-y-5">
            {/* Progress Bar & Congratulations */}
            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-sans">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between text-xs font-black font-sans">
                  <span className="text-slate-700 uppercase tracking-wider">Tiến độ làm quen:</span>
                  <span className="text-blue-700 font-mono">{guideCompletedSteps.length} / 4 bước ({Math.round((guideCompletedSteps.length / 4) * 100)}%)</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(guideCompletedSteps.length / 4) * 100}%` }}
                  ></div>
                </div>
              </div>
              
              {guideCompletedSteps.length === 4 ? (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-250 py-2.5 px-4 rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 select-none animate-zoom-in font-sans">
                  <span>🎉</span>
                  <span>Tuyệt vời! Thầy đã hoàn thành xuất sắc hướng dẫn cơ bản và sẵn sàng vận hành trơng tru!</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 font-semibold bg-white border border-slate-100 py-2.5 px-3 rounded-xl flex items-center gap-1.5 select-none font-sans">
                  <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Kích vào các ô tròn để đánh dấu và theo dõi tiến độ của thầy.</span>
                </div>
              )}
            </div>

            {/* Step Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
              {/* Step 1 */}
              <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${guideCompletedSteps.includes(1) ? 'bg-slate-50/50 border-slate-100 opacity-75 shadow-none' : 'bg-white border-slate-150 hover:shadow-sm hover:-translate-y-0.5'}`}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleStepCompleted(1)}
                      className={`h-5.5 w-5.5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-all ${guideCompletedSteps.includes(1) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 hover:border-blue-450 bg-white'}`}
                      title={guideCompletedSteps.includes(1) ? 'Hủy đánh dấu' : 'Đánh dấu hoàn thành'}
                    >
                      {guideCompletedSteps.includes(1) ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <span className="text-[10px] font-black text-slate-400">1</span>}
                    </button>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wider border ${guideCompletedSteps.includes(1) ? 'bg-slate-200 text-slate-600 border-slate-250' : 'bg-blue-50 text-blue-700 border-blue-105'}`}>
                      Tuyển sinh & Phí
                    </span>
                  </div>
                  
                  <h4 className={`text-sm font-black tracking-tight ${guideCompletedSteps.includes(1) ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                    1. Đăng ký & Nộp học phí
                  </h4>
                  <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                    Ghi danh học viên mới học từ cơ bản đến nâng cao. Nhập hạng bằng (B1/B2/C), lập phiếu thu học phí ban đầu và theo dõi biên nhận tài chính dễ dàng.
                  </p>
                </div>
                
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 select-none text-[11px] font-sans">
                  <button
                    type="button"
                    onClick={() => onOpenQuickForm('student')}
                    className="font-black text-blue-600 hover:underline cursor-pointer"
                  >
                    Ghi danh nhanh
                  </button>
                  <span className="text-slate-300 font-medium">|</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('hoc-vien')}
                    className="font-black text-slate-500 hover:underline cursor-pointer"
                  >
                    Hồ sơ Học viên
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${guideCompletedSteps.includes(2) ? 'bg-slate-50/50 border-slate-100 opacity-75 shadow-none' : 'bg-white border-slate-150 hover:shadow-sm hover:-translate-y-0.5'}`}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleStepCompleted(2)}
                      className={`h-5.5 w-5.5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-all ${guideCompletedSteps.includes(2) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 hover:border-blue-450 bg-white'}`}
                      title={guideCompletedSteps.includes(2) ? 'Hủy đánh dấu' : 'Đánh dấu hoàn thành'}
                    >
                      {guideCompletedSteps.includes(2) ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <span className="text-[10px] font-black text-slate-400">2</span>}
                    </button>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wider border ${guideCompletedSteps.includes(2) ? 'bg-slate-200 text-slate-600 border-slate-250' : 'bg-indigo-50 text-indigo-700 border-indigo-105'}`}>
                      Xếp lịch dạy
                    </span>
                  </div>
                  
                  <h4 className={`text-sm font-black tracking-tight ${guideCompletedSteps.includes(2) ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                    2. Lên buổi tập trống
                  </h4>
                  <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                    Sắp lớp dắt tay đơn lẻ hoặc dùng "Xếp Lịch Tự Động" để AI tự phân bổ xe, thầy và lịch học tối ưu dựa trên thời gian trống mà không lo trùng lặp ca dạy.
                  </p>
                </div>
                
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 select-none text-[11px] font-sans">
                  <button
                    type="button"
                    onClick={() => onOpenQuickForm('schedule')}
                    className="font-black text-blue-600 hover:underline cursor-pointer"
                  >
                    Xếp thủ công
                  </button>
                  <span className="text-slate-300 font-medium">|</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('auto-schedule')}
                    className="font-black text-indigo-600 hover:underline cursor-pointer"
                  >
                    Auto-Schedule
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${guideCompletedSteps.includes(3) ? 'bg-slate-50/50 border-slate-100 opacity-75 shadow-none' : 'bg-white border-slate-150 hover:shadow-sm hover:-translate-y-0.5'}`}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleStepCompleted(3)}
                      className={`h-5.5 w-5.5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-all ${guideCompletedSteps.includes(3) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 hover:border-blue-450 bg-white'}`}
                      title={guideCompletedSteps.includes(3) ? 'Hủy đánh dấu' : 'Đánh dấu hoàn thành'}
                    >
                      {guideCompletedSteps.includes(3) ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <span className="text-[10px] font-black text-slate-400">3</span>}
                    </button>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wider border ${guideCompletedSteps.includes(3) ? 'bg-slate-200 text-slate-600 border-slate-250' : 'bg-emerald-50 text-emerald-700 border-emerald-105'}`}>
                      Lớp & Điều phối
                    </span>
                  </div>
                  
                  <h4 className={`text-sm font-black tracking-tight ${guideCompletedSteps.includes(3) ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                    3. Điều phối 1 chạm
                  </h4>
                  <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                    Trước giờ xuất phát, giám sát ca học hôm nay ở ngay góc dưới. Bạn có thể điểm danh Có mặt/Vắng nhanh, viết nhận xét của thầy hoặc đổi lịch cấp tốc.
                  </p>
                </div>
                
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 select-none text-[11px] font-sans">
                  <button
                    type="button"
                    onClick={() => {
                      const element = document.getElementById('quick-attendance-timeline') || document.getElementById('today-lessons-section');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      } else {
                        onNavigate('lich-hoc');
                      }
                    }}
                    className="font-black text-emerald-600 hover:underline cursor-pointer"
                  >
                    Xem lịch dắt tay
                  </button>
                </div>
              </div>

              {/* Step 4 */}
              <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${guideCompletedSteps.includes(4) ? 'bg-slate-50/50 border-slate-100 opacity-75 shadow-none' : 'bg-white border-slate-150 hover:shadow-sm hover:-translate-y-0.5'}`}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleStepCompleted(4)}
                      className={`h-5.5 w-5.5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-all ${guideCompletedSteps.includes(4) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 hover:border-blue-450 bg-white'}`}
                      title={guideCompletedSteps.includes(4) ? 'Hủy đánh dấu' : 'Đánh dấu hoàn thành'}
                    >
                      {guideCompletedSteps.includes(4) ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <span className="text-[10px] font-black text-slate-400">4</span>}
                    </button>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wider border ${guideCompletedSteps.includes(4) ? 'bg-slate-200 text-slate-600 border-slate-250' : 'bg-amber-50 text-amber-700 border-amber-105'}`}>
                      An Toàn Đội Xe
                    </span>
                  </div>
                  
                  <h4 className={`text-sm font-black tracking-tight ${guideCompletedSteps.includes(4) ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                    4. Giám sát thiết bị, xe cộ
                  </h4>
                  <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                    Xem và cập nhật thể trạng đội xe tập. Gắn nhãn Đang bảo dưỡng/Đang hỏng khi xe có sự cố để bộ tự động ưu tiên né các phương tiện lỗi trong ca học.
                  </p>
                </div>
                
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 select-none text-[11px] font-sans">
                  <button
                    type="button"
                    onClick={() => onNavigate('xe-tap')}
                    className="font-black text-amber-600 hover:underline cursor-pointer"
                  >
                    Kiểm tra Xe tập lái
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Main Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Schedule Timeline & Attendance Quick Control */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Today Timeline */}
          {enabledWidgets.includes('todayLessons') && (
            <div className="hidden lg:block bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-extrabold text-slate-800">Lịch Học Hôm Nay ({TODAY})</h2>
                <p className="text-xs text-slate-400 font-medium">Nhấn điểm nhanh nhanh tiến độ học viên</p>
              </div>
              <button
                onClick={() => setAttendanceView(!attendanceView)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-xl cursor-pointer"
              >
                {attendanceView ? 'Quay lại Timeline' : 'Điểm danh nhanh'}
              </button>
            </div>

            {todayLessons.length === 0 ? (
              <div className="h-32 flex flex-col justify-center items-center rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                Không có lịch dạy nào được xếp cho ngày hôm nay.
              </div>
            ) : attendanceView ? (
              // Quick attendance grid
              <div className="space-y-3">
                {todayLessons.map((les) => {
                  const student = students.find(s => s.id === les.studentId);
                  const teacher = instructors.find(i => i.id === les.instructorId);
                  return (
                    <div key={les.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-700">{les.startTime} - {les.endTime}</div>
                        <div className="text-sm font-black text-slate-900 mt-0.5">{student?.name}</div>
                        <div className="text-[11px] font-bold text-slate-400 mt-1">
                          GV phụ trách: {teacher?.name || 'Tự động'} • {les.lessonType}
                        </div>
                      </div>

                      {/* State Action Buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        {les.attendanceStatus === 'Chưa điểm danh' ? (
                          <>
                            <button
                              onClick={() => handleQuickAttendance(les.id, 'Có mặt')}
                              className="px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700 transition-all"
                            >
                              ✓ Có mặt
                            </button>
                            <button
                              onClick={() => handleQuickAttendance(les.id, 'Vắng')}
                              className="px-3 py-1.5 rounded-xl font-bold text-xs bg-red-100 text-red-700 cursor-pointer hover:bg-red-200 transition-all"
                            >
                              ✗ Vắng
                            </button>
                          </>
                        ) : (
                          <span className={`text-xs font-extrabold px-3 py-1.5 rounded-xl border ${les.attendanceStatus === 'Có mặt' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                            {les.attendanceStatus === 'Có mặt' ? '✓ Đã Có Mặt' : '✗ Vắng Học'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // General timeline view
              <div className="relative border-l-2 border-slate-100 pl-4 ml-2.5 space-y-4">
                {todayLessons.sort((a,b)=>a.startTime.localeCompare(b.startTime)).map((les) => {
                  const student = students.find(s => s.id === les.studentId);
                  const teacher = instructors.find(i => i.id === les.instructorId);
                  const car = vehicles.find(v => v.id === les.vehicleId);

                  let statusColor = 'bg-blue-50 text-blue-700 border-blue-100';
                  if (les.status === 'Đã hoàn thành') statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                  if (les.status.includes('nghỉ') || les.status === 'Hủy lịch') statusColor = 'bg-red-50 text-red-700 border-red-100';

                  return (
                    <div key={les.id} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[23px] top-1.5 bg-blue-600 rounded-full h-2.5 w-2.5 ring-4 ring-white"></div>
                      
                      <div className="p-4 rounded-2xl border border-slate-100 hover:border-blue-100 hover:bg-blue-50/5 transition-all">
                        <div className="flex justify-between items-start gap-2">
                          <div className="text-xs font-bold text-slate-400">{les.startTime} - {les.endTime}</div>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${statusColor}`}>
                            {les.status}
                          </span>
                        </div>
                        
                        <h4 className="text-sm font-black text-slate-800 mt-1">{student?.name}</h4>
                        
                        <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs text-slate-500 font-medium pb-1.5">
                          <div>
                            <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Học sa hình</span>
                            {les.lessonType}
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Giáo viên & Xe</span>
                            {teacher?.name} • {car?.plate || 'Vios AT'}
                          </div>
                        </div>

                        {les.pickupLocation && (
                          <div className="text-[11px] leading-relaxed text-slate-400 pt-1.5 border-t border-slate-50">
                            <strong>Đón:</strong> {les.pickupLocation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Action List Section ('Việc cần xử lý') */}
          {enabledWidgets.includes('conflicts') && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-800">Việc Cần Xử Lý Ngay</h2>
              <p className="text-xs text-slate-400 font-medium">Hệ thống phát hiện sai lệch lịch và công nợ</p>
            </div>

            <div className="space-y-2.5">
              {/* Overdue Payment Item */}
              {overdueTuitions.map((s) => (
                <div key={s.id} className="p-3.5 border border-red-100 bg-red-50/10 rounded-2xl flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-black text-slate-800">
                      Tuyển sinh: Học viên nợ quá hạn nộp học phí
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      <strong>{s.name}</strong> nợ <strong className="text-red-700">{s.remainingAmount.toLocaleString('vi-VN')} ₫</strong> (Hạn cuối đóng là {new Date(s.nextPaymentDeadline).toLocaleDateString('vi-VN')}). Ghi chú: {s.notes}
                    </p>
                    <button
                      onClick={() => onNavigate('hoc-vien')}
                      className="text-[11px] font-bold text-red-600 hover:underline flex items-center"
                    >
                      Mở hồ sơ đòi phí <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Conflict list item */}
              {conflictedLessons.map(({ lessonA, reason }) => {
                const stud = students.find(s => s.id === lessonA.studentId);
                return (
                  <div key={lessonA.id} className="p-3.5 border border-orange-100 bg-orange-50/10 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-xs font-black text-slate-800">
                        Xung đột trùng lịch giảng dạy ngày {new Date(lessonA.date).toLocaleDateString('vi-VN')}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Lịch học viên <strong>{stud?.name}</strong> bị trùng: <span className="text-orange-700 font-bold">{reason}</span>.
                      </p>
                      <button
                        onClick={() => onNavigate('lich-hoc')}
                        className="text-[11px] font-bold text-orange-600 hover:underline flex items-center"
                      >
                        Mở để xếp lại lịch học <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Inactivity notification */}
              {students.filter(s => {
                if (s.status !== 'Đang học') return false;
                const studentLessons = lessons.filter(l => l.studentId === s.id && l.status === 'Đã hoàn thành');
                if (studentLessons.length === 0) return true;
                const lastDateStr = studentLessons.reduce((latest, l) => l.date > latest ? l.date : latest, '1970-01-01');
                const diffMs = new Date(TODAY).getTime() - new Date(lastDateStr).getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                return diffDays >= 7;
              }).slice(0, 2).map((s) => (
                <div key={s.id} className="p-3.5 border border-blue-50 bg-blue-50/10 rounded-2xl flex items-start gap-3">
                  <BellRing className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-black text-slate-800">
                      Cảnh báo: Học viên ngừng học hơn 7 ngày
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Học viên <strong>{s.name}</strong> ({s.phone}) thời gian qua chưa đăng ký thêm giờ học DAT hoặc sa hình nào.
                    </p>
                    <button
                      onClick={() => onNavigate('hoc-vien')}
                      className="text-[11px] font-bold text-blue-600 hover:underline flex items-center"
                    >
                      Gọi điện nhắc lịch <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

              {conflictedLessons.length === 0 && overdueTuitions.length === 0 && (
                <div className="text-center py-4 text-xs font-extrabold text-emerald-600 bg-emerald-50/50 border border-dashed border-emerald-200 rounded-2xl">
                  ✓ Tuyệt vời! Hệ thống vận hành trơn tru không có rủi ro trùng lịch.
                </div>
              )}
            </div>
          </div>
          )}

          {/* Overdue Learning Notification Widget */}
          {enabledWidgets.includes('overdueLearning') && (
            <div className="bg-white rounded-3xl border border-rose-100 hover:border-rose-200 transition-all shadow-sm p-5 space-y-4 text-left">
              <div className="flex justify-between items-center pb-2 border-b border-rose-50 flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5 uppercase font-sans">
                    🚨 Học Viên Quá Hạn Học (trên 14 ngày)
                  </h2>
                  <p className="text-[11px] text-rose-500 font-bold mt-0.5 font-sans">
                    Tự động phát hiện học viên đang học nhưng 14 ngày qua không có ca học hoạt động nào
                  </p>
                </div>
                <span className="bg-rose-100 text-rose-700 font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase self-start">
                  {overdueStudentsList.length} Học viên
                </span>
              </div>

              {overdueStudentsList.length === 0 ? (
                <div className="h-24 flex flex-col justify-center items-center rounded-2xl border border-dashed border-rose-200 text-slate-400 text-xs text-center py-6">
                  <span>🎉 Tuyệt vời! Không có học viên nào bị trễ hạn quá 14 ngày.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {overdueStudentsList.slice(0, 4).map((s) => {
                    // Calculate days since last lesson OR show 'Chưa học buổi nào'
                    const studentLessons = lessons.filter(l => l.studentId === s.id && l.status !== 'Hủy lịch' && l.status !== 'Học viên báo nghỉ' && l.status !== 'Giảng viên báo nghỉ');
                    let daysText = 'Chưa xếp lịch';
                    let lastDateStr = '';
                    if (studentLessons.length > 0) {
                      const latestDateStr = studentLessons.reduce((latest, l) => l.date > latest ? l.date : latest, '1970-01-01');
                      const diffMs = new Date(TODAY).getTime() - new Date(latestDateStr).getTime();
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      daysText = `${diffDays} ngày chưa lái`;
                      lastDateStr = `Buổi cuối: ${new Date(latestDateStr).toLocaleDateString('vi-VN')}`;
                    }

                    return (
                      <div key={s.id} className="p-3.5 rounded-2xl border border-rose-50 hover:bg-rose-50/5 hover:border-rose-100 transition-all flex flex-col justify-between gap-3 text-left">
                        <div className="space-y-1">
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-[10px] font-black text-rose-600 font-mono tracking-wider">{s.code}</span>
                            <span className="bg-rose-50 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tight">
                              {daysText}
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">{s.name}</h4>
                          <p className="text-[10.5px] text-slate-500 font-semibold">
                            Hạng bằng: <strong className="text-slate-700">{s.licenseClass}</strong> • SĐT: <strong className="text-slate-700">{s.phone}</strong>
                          </p>
                          {lastDateStr && (
                            <p className="text-[10px] text-rose-400 font-bold">{lastDateStr}</p>
                          )}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {s.tags && s.tags.map((tag) => (
                              <span key={tag} className="bg-slate-100 border border-slate-200 text-slate-650 font-extrabold text-[8px] px-1 py-0.2 rounded uppercase">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                          <a
                            href={`tel:${s.phone}`}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer flex-1 justify-center transition-colors border border-blue-100"
                          >
                            📞 Gọi điện
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              alert(`Đã gửi mẫu nhắn giục nhập học ngay tới Zalo học viên: ${s.name} (${s.phone}) thành công!`);
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black px-2 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer flex-1 justify-center transition-colors shadow-xs"
                          >
                            💬 Nhắc học
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {overdueStudentsList.length > 4 && (
                    <div className="col-span-full text-center mt-2">
                      <button
                        onClick={() => onNavigate('hoc-vien')}
                        className="text-[10px] font-black text-rose-600 hover:underline hover:text-rose-700 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-lg cursor-pointer"
                      >
                        Xem thêm {overdueStudentsList.length - 4} học viên quá hạn khác
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Mini LED reports & Reminders */}
        <div className="space-y-6">
          
          {/* Recent Money Transactions */}
          {enabledWidgets.includes('recentActivity') && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-800 font-mono">Phiếu Thu Gần Đây</h2>
                <p className="text-xs text-slate-400 font-medium">Báo cáo kiểm toán lập tức</p>
              </div>

              <div className="space-y-3">
                {recentPayments.map((p) => {
                  const sObj = students.find(s => s.id === p.studentId);
                  return (
                    <div key={p.id} className="flex justify-between items-start gap-2.5 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-800">{sObj?.name || 'Học viên'}</div>
                        <div className="text-[10px] text-slate-400">{new Date(p.paymentDate).toLocaleDateString('vi-VN')} • {p.method}</div>
                        <span className="inline-block text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md mt-1">
                          {p.category}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-extrabold ${p.isCancelled ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>
                          {p.amount.toLocaleString('vi-VN')} ₫
                        </span>
                        {p.isCancelled && (
                          <span className="block text-[8px] text-red-500 font-bold uppercase mt-0.5">Hủy phiếu</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Students Needing tuition reminders list */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-800">Nhắc Phí Học Viên</h2>
              <p className="text-xs text-slate-400 font-medium">Học viên còn nợ nhiều hoặc quá hạn</p>
            </div>

            <div className="space-y-3">
              {reminderStudents.map((s) => {
                let badgeColor = 'bg-red-50 text-red-700 border-red-100';
                if (s.reminderStatus === 'Đã hẹn ngày thanh toán') badgeColor = 'bg-amber-50 text-amber-700 border-amber-100';

                return (
                  <div key={s.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-800">{s.name}</span>
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                        {s.reminderStatus}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-baseline text-xs text-slate-500">
                      <span>Số nợ:</span>
                      <span className="font-extrabold text-slate-700">{s.remainingAmount.toLocaleString('vi-VN')} ₫</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200/50 flex justify-between items-center text-[10px]">
                      <span className="text-slate-400">Tel: {s.phone}</span>
                      <a
                        href={`tel:${s.phone}`}
                        className="text-blue-600 font-extrabold hover:underline"
                      >
                        Gọi ngay
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

      {/* QUICK RESCHEDULE MODAL */}
      {rescheduleLesson && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl p-5 space-y-4 animate-zoom-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <Calendar className="h-5 w-5 text-blue-600 animate-bounce" /> Thay đổi lịch học
              </h3>
              <button
                onClick={() => setRescheduleLesson(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs font-bold text-slate-700">
              <p className="text-slate-500 font-semibold text-left">Thay đổi lịch của học viên <strong className="text-slate-800">{students.find(s => s.id === rescheduleLesson.studentId)?.name}</strong></p>
              
              <div className="space-y-1 text-left">
                <label className="block text-[10px] text-slate-400 uppercase font-black">Chọn ngày học mới:</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-400 uppercase font-black">Giờ bắt đầu:</label>
                  <input
                    type="time"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-400 uppercase font-black">Giờ kết thúc:</label>
                  <input
                    type="time"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 text-xs font-bold select-none">
                <button
                  type="button"
                  onClick={() => setRescheduleLesson(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Bỏ qua
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateLesson(rescheduleLesson.id, {
                      date: newDate,
                      startTime: newStart,
                      endTime: newEnd
                    });
                    setRescheduleLesson(null);
                    alert('Đổi lịch học thành công!');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs cursor-pointer"
                >
                  ✓ Cập nhật
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK NOTES / DEBRIEF MODAL */}
      {notesLesson && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl p-5 space-y-4 animate-zoom-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5 text-left">
                <Edit3 className="h-5 w-5 text-blue-600" /> Nhận xét giảng viên
              </h3>
              <button
                onClick={() => setNotesLesson(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-bold text-slate-700">
              <p className="text-slate-500 font-semibold text-left">
                Chỉnh sửa lời nhận xét cho học viên <strong className="text-slate-800">{students.find(s => s.id === notesLesson.studentId)?.name}</strong>:
              </p>

              {/* Tag presets slider */}
              <div className="space-y-1.5 text-left">
                <span className="block text-[9px] text-slate-400 uppercase tracking-wide font-black">Chạm chọn nhận xét nhanh:</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    'Lái tốt, vững tâm lý',
                    'Luyện thêm lùi chuồng dọc',
                    'Ổn định tốc độ, phanh hơi gấp',
                    'Vô lăng còn cứng, rụt rè',
                    'Cần chú ý quan sát gương',
                    'Đề pa leo dốc cần nhạy côn',
                    'Tinh thần tự giác tốt'
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setNewNoteText(tag)}
                      className={`text-[9px] py-1.5 px-2.5 rounded-xl border font-black transition-all hover:scale-102 cursor-pointer ${newNoteText === tag ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-slate-50 border-slate-150 text-slate-650 hover:bg-slate-100'}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="block text-[10px] text-slate-400 uppercase font-black text-left">Ý kiến chi tiết khác:</label>
                <textarea
                  rows={3}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Thầy viết nhận xét cho học viên..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {notesSuccess && (
                <div className="p-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-[10px] font-bold text-center">
                  {notesSuccess}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setNotesLesson(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-705 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Huỷ bỏ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateLesson(notesLesson.id, { resultNote: newNoteText });
                    setNotesSuccess('Đã đồng bộ nhận xét của thầy!');
                    setTimeout(() => {
                      setNotesLesson(null);
                    }, 650);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs cursor-pointer"
                >
                  ✓ Lưu lại
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⚙️ WIDGETS CUSTOMIZATION SETTINGS MODAL */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-zoom-in text-left">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-800">⚙️ TÙY BIẾN TRANG CHỦ</h3>
                <p className="text-[11px] text-slate-400 font-bold mt-0.5">Lựa chọn các thông tin ưu tiên muốn hiển thị ở trang chủ</p>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1 px-2.5 bg-slate-150 hover:bg-slate-200 text-slate-500 rounded-lg text-xs font-black cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-500">Giáo viên bật/tắt các tiện ích hiển thị để phù hợp với quy trình dạy học cá nhân:</p>
              
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {[
                  { id: 'kpis', title: '📊 Thống kê chỉ số cốt lõi', desc: 'Thống kê tổng quan số giờ lái, doanh thu tháng, công nợ và số học viên hôm nay.' },
                  { id: 'today-kpis', title: '📈 Đo lường hiệu suất (KPI)', desc: 'Tổng số giờ lái đã tích lũy trong tháng, tỷ lệ thi đỗ, ca còn trống trong 7 ngày.' },
                  { id: 'todayLessons', title: '📅 Lịch học hôm nay (Timeline)', desc: 'Chi tiết danh sách các ca thực hành dắt tay hôm nay và điểm danh một chạm.' },
                  { id: 'overdueLearning', title: '🚨 Báo động Học viên trễ hạn', desc: 'Nhắc nhở học viên quá hạn 14 ngày chưa lái để giáo viên liên hệ ngay.' },
                  { id: 'conflicts', title: '⚠️ Xử lý sai lệch lịch & Công nợ', desc: 'Cảnh báo trùng lịch giảng dạy, phương tiện, bài học và học viên trễ nợ học phí.' },
                  { id: 'recentActivity', title: '💵 Sổ thu chi tiền mặt gần đây', desc: 'Danh sách và kiểm toán phiếu thu nhận học phí phát sinh mới nhất.' },
                  { id: 'quickGuide', title: '💡 Hướng dẫn cho giáo viên mới', desc: 'Trợ giúp làm quen nhanh quy trình quản lý dắt tay học viên.' }
                ].map((item) => {
                  const isChecked = enabledWidgets.includes(item.id);
                  return (
                    <label key={item.id} className="flex items-start gap-3 p-3 rounded-2xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors shadow-xs">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const updated = isChecked
                            ? enabledWidgets.filter(id => id !== item.id)
                            : [...enabledWidgets, item.id];
                          saveWidgets(updated);
                        }}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 shrink-0"
                      />
                      <div>
                        <span className="block text-xs font-black text-slate-800">{item.title}</span>
                        <span className="block text-[10.5px] font-semibold text-slate-400 mt-0.5 leading-relaxed">{item.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  ✓ Áp dụng bố cục mới
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
