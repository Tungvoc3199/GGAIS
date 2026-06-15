/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Lesson, Instructor, Vehicle, Student, LessonType, LessonStatus, AttendanceStatus } from '../types';
import { checkLessonConflicts, suggestAvailableSlots } from '../services/scheduling';
import { exportScheduleToExcel, printSchedulePDF } from '../utils/exportUtils';
import {
  Calendar as CalendarIcon,
  Plus,
  X,
  AlertTriangle,
  User,
  Clock,
  MapPin,
  FileText,
  Search,
  CheckCircle,
  Truck,
  Grid,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Phone,
  Edit3,
  CalendarDays,
  UserCheck,
  Download,
  Printer
} from 'lucide-react';

interface ScheduleProps {
  quickFormOpen?: boolean;
  onCloseQuickForm?: () => void;
}

export const Schedule: React.FC<ScheduleProps> = ({ quickFormOpen, onCloseQuickForm }) => {
  const {
    currentUser,
    lessons,
    students,
    instructors,
    vehicles,
    settings,
    addLesson,
    updateLesson,
    deleteLesson
  } = useDatabase();

  const showScheduleToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setLastSaveMessage(message);
    const toast = (window as any).__lhpToast;
    if (typeof toast === 'function') {
      toast(message, type);
    } else {
      console[type === 'error' ? 'error' : 'log'](`[Schedule ${type}]`, message);
    }
  };

  const isExistingInstructorId = (id?: string) => instructors.some(i => i.id === id);
  const isExistingVehicleId = (id?: string) => vehicles.some(v => v.id === id);

  const isOperationalVehicle = (vehicle: Vehicle | undefined) => {
    const status = String(vehicle?.status || '').trim().toLowerCase();
    if (!vehicle) return false;
    if (['bảo dưỡng', 'sửa', 'hỏng', 'ngừng', 'không hoạt động', 'khóa', 'đã bán'].some(k => status.includes(k))) return false;
    return true;
  };

  const getCompatibleInstructorId = (student?: Student, preferredId?: string) => {
    if (preferredId && isExistingInstructorId(preferredId)) return preferredId;
    if (!student) return instructors[0]?.id || '';

    const assigned = instructors.find(i =>
      i.id === student.assignedInstructorId &&
      i.active !== false &&
      (!i.status || i.status === 'Đang dạy') &&
      i.vehicleTypes?.includes(student.licenseClass)
    );
    if (assigned) return assigned.id;

    const compatible = instructors.find(i =>
      i.active !== false &&
      (!i.status || i.status === 'Đang dạy') &&
      i.vehicleTypes?.includes(student.licenseClass)
    );
    return compatible?.id || instructors[0]?.id || '';
  };

  const getCompatibleVehicleId = (student?: Student, preferredId?: string) => {
    if (preferredId && isExistingVehicleId(preferredId)) return preferredId;
    if (!student) return vehicles[0]?.id || '';

    const assigned = vehicles.find(v =>
      v.id === student.assignedVehicleId &&
      isOperationalVehicle(v) &&
      (!v.suitableLicenseClass || v.suitableLicenseClass === student.licenseClass)
    );
    if (assigned) return assigned.id;

    const compatible = vehicles.find(v =>
      isOperationalVehicle(v) &&
      (!v.suitableLicenseClass || v.suitableLicenseClass === student.licenseClass)
    );
    return compatible?.id || vehicles[0]?.id || '';
  };

  // Calendar Views: 'list' | 'day' | 'week' | 'month' | 'resource_instructor' | 'resource_vehicle'
  const [viewType, setViewType] = useState<'list' | 'day' | 'week' | 'month' | 'by_instructor' | 'by_vehicle'>('list');
  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayString()); // Default to today's real date

  // Filter lessons by text/student search in list view
  const [searchQuery, setSearchQuery] = useState('');
  const [filterInstructorId, setFilterInstructorId] = useState<string>('all');

  const displayedLessons = lessons.filter(l => {
    if (filterInstructorId && filterInstructorId !== 'all') {
      return l.instructorId === filterInstructorId;
    }
    return true;
  });

  // Lesson Edit/Add Form states
  const [isBooking, setIsBooking] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [lastSaveMessage, setLastSaveMessage] = useState('');

  // Form Fields
  const [formStudentId, setFormStudentId] = useState('');
  const [formInstructorId, setFormInstructorId] = useState('');
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formDate, setFormDate] = useState(getTodayString());
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('10:00');
  const [formType, setFormType] = useState<LessonType>('Sa hình');
  const [formPickup, setFormPickup] = useState('15 Tôn Thất Thuyết');
  const [formTraining, setFormTraining] = useState('Bãi tập Tây Mỗ');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<LessonStatus>('Chờ xác nhận');
  const [formAttendance, setFormAttendance] = useState<AttendanceStatus>('Chưa điểm danh');
  const [formResult, setFormResult] = useState('');

  // Conflict state management
  const [conflictWarning, setConflictWarning] = useState<string[]>([]);
  const [conflictAlternatives, setConflictAlternatives] = useState<{ date: string; startTime: string; endTime: string }[]>([]);
  const [showOverride, setShowOverride] = useState(false);

  // States for fast actions on mobile layout
  const [rescheduleLesson, setRescheduleLesson] = useState<Lesson | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const [notesLesson, setNotesLesson] = useState<Lesson | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [notesSuccess, setNotesSuccess] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (quickFormOpen) {
      setIsBooking(true);
      if (onCloseQuickForm) {
        onCloseQuickForm();
      }
    }
  }, [quickFormOpen, onCloseQuickForm]);

  useEffect(() => {
    if (!isBooking || !formStudentId) return;
    const student = students.find(s => s.id === formStudentId);
    if (!student) return;

    if (!isExistingInstructorId(formInstructorId)) {
      setFormInstructorId(getCompatibleInstructorId(student, student.assignedInstructorId));
    }

    if (!isExistingVehicleId(formVehicleId)) {
      setFormVehicleId(getCompatibleVehicleId(student, student.assignedVehicleId));
    }
  }, [isBooking, formStudentId, instructors, vehicles, students]);

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

  // Move Calendar date helper
  const getMondayOfDate = (dStr: string) => {
    const d = new Date(dStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    return monday;
  };

  const checkTimeOverlap = (startTimeA: string, endTimeA: string, startTimeB: string, endTimeB: string): boolean => {
    const [startAHour, startAMin] = startTimeA.split(':').map(Number);
    const [endAHour, endAMin] = endTimeA.split(':').map(Number);
    const [startBHour, startBMin] = startTimeB.split(':').map(Number);
    const [endBHour, endBMin] = endTimeB.split(':').map(Number);

    const startA = startAHour * 60 + startAMin;
    const endA = endAHour * 60 + endAMin;
    const startB = startBHour * 60 + startBMin;
    const endB = endBHour * 60 + endBMin;

    return startA < endB && startB < endA;
  };

  const getWeekLessonConflicts = (les: Lesson, allWeekLessons: Lesson[]) => {
    const currentConflicts: { type: 'instructor' | 'vehicle' | 'student'; withLesson: Lesson; label: string }[] = [];
    
    for (const other of allWeekLessons) {
      if (other.id === les.id || other.date !== les.date) continue;
      
      if (checkTimeOverlap(les.startTime, les.endTime, other.startTime, other.endTime)) {
        if (les.instructorId && les.instructorId === other.instructorId) {
          const ins = instructors.find(i => i.id === les.instructorId);
          const st = students.find(s => s.id === other.studentId);
          currentConflicts.push({
            type: 'instructor',
            withLesson: other,
            label: `Trùng Giáo viên (${ins?.name || 'GV'}) với học viên ${st?.name || 'HV'}`
          });
        }
        if (les.vehicleId && les.vehicleId === other.vehicleId) {
          const veh = vehicles.find(v => v.id === les.vehicleId);
          const st = students.find(s => s.id === other.studentId);
          currentConflicts.push({
            type: 'vehicle',
            withLesson: other,
            label: `Trùng Xe (${veh?.plate || 'Xe'}) với học viên ${st?.name || 'HV'}`
          });
        }
        if (les.studentId && les.studentId === other.studentId) {
          currentConflicts.push({
            type: 'student',
            withLesson: other,
            label: `Học viên trùng giờ học`
          });
        }
      }
    }
    return currentConflicts;
  };

  const adjustDate = (days: number) => {
    const d = new Date(selectedDate);
    // If we are in weekly view, clicking left/right should adjust by exactly 7 days (a week) to keep navigating week by week.
    const steps = viewType === 'week' ? (days > 0 ? 7 : -7) : days;
    d.setDate(d.getDate() + steps);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const getActiveLessons = (): Lesson[] => {
    if (viewType === 'list') {
      return displayedLessons.filter(l => {
        if (!searchQuery) return true;
        const studentObj = students.find(s => s.id === l.studentId);
        return studentObj?.name.toLowerCase().includes(searchQuery.toLowerCase());
      });
    } else if (viewType === 'week') {
      const startOfWeek = getMondayOfDate(selectedDate);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      const startStr = startOfWeek.toISOString().split('T')[0];
      const endStr = endOfWeek.toISOString().split('T')[0];
      return displayedLessons.filter(l => l.date >= startStr && l.date <= endStr);
    } else {
      return displayedLessons.filter(l => l.date === selectedDate);
    }
  };

  const getActiveTitle = (): string => {
    const dateParts = selectedDate.split('-');
    const displayDateStr = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : selectedDate;
    if (viewType === 'list') {
      return searchQuery ? `Tìm kiếm học viên: "${searchQuery}"` : 'Tất Cả Lịch Trình Lên Lớp';
    } else if (viewType === 'day') {
      return `Lịch Học Thực Hành Ngày ${displayDateStr}`;
    } else if (viewType === 'week') {
      const mon = getMondayOfDate(selectedDate);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return `Lịch Học Tuần Từ ${mon.toLocaleDateString('vi-VN')} Đến ${sun.toLocaleDateString('vi-VN')}`;
    } else if (viewType === 'by_instructor') {
      return `Phân Bổ Ca Dạy Theo Giảng Viên Ngày ${displayDateStr}`;
    } else if (viewType === 'by_vehicle') {
      return `Phân Bổ Ca Dạy Theo Xe Tập Ngày ${displayDateStr}`;
    }
    return `Lịch Học Ngày ${displayDateStr}`;
  };

  // Open booking form
  const handleOpenNewBooking = () => {
    // Default to first student details
    if (students.length > 0) {
      const defaultS = students[0];
      setFormStudentId(defaultS.id);
      setFormInstructorId(getCompatibleInstructorId(defaultS, defaultS.assignedInstructorId));
      setFormVehicleId(getCompatibleVehicleId(defaultS, defaultS.assignedVehicleId));
      setFormPickup(defaultS.address || 'Đón tại Trung tâm');
    } else {
      setFormStudentId('');
      setFormInstructorId('');
      setFormVehicleId('');
      setFormPickup('');
    }

    setEditingLessonId(null);
    setFormDate(selectedDate);
    setFormStart('08:00');
    setFormEnd('10:00');
    setFormType('Sa hình');
    setFormNotes('');
    setFormStatus('Chờ xác nhận');
    setFormAttendance('Chưa điểm danh');
    setFormResult('');
    setConflictWarning([]);
    setConflictAlternatives([]);
    setShowOverride(false);
    setOverrideReason('');
    setLastSaveMessage('');
    setIsSavingLesson(false);
    setIsBooking(true);
  };

  // Open edit booking form
  const handleOpenEditBooking = (les: Lesson) => {
    setEditingLessonId(les.id);
    setFormStudentId(les.studentId);
    setFormInstructorId(les.instructorId);
    setFormVehicleId(les.vehicleId);
    setFormDate(les.date);
    setFormStart(les.startTime);
    setFormEnd(les.endTime);
    setFormType(les.lessonType);
    setFormPickup(les.pickupLocation);
    setFormTraining(les.trainingLocation);
    setFormNotes(les.notes);
    setFormStatus(les.status);
    setFormAttendance(les.attendanceStatus);
    setFormResult(les.resultNote);

    setConflictWarning([]);
    setConflictAlternatives([]);
    setShowOverride(false);
    setOverrideReason('');
    setLastSaveMessage('');
    setIsSavingLesson(false);
    setIsBooking(true);
  };

  // Submit hander with complex conflict validation rules
  const handleSaveLesson = async (e: React.FormEvent, isOverride = false) => {
    e.preventDefault();
    setLastSaveMessage('');
    setIsSavingLesson(true);

    try {
      const selectedStudent = students.find(s => s.id === formStudentId);
      const safeInstructorId = getCompatibleInstructorId(selectedStudent, formInstructorId);
      const safeVehicleId = getCompatibleVehicleId(selectedStudent, formVehicleId);

      if (!formStudentId || !safeInstructorId || !safeVehicleId) {
        const message = 'Không tìm thấy đủ học viên, giảng viên hoặc xe hợp lệ để xếp lịch. Vui lòng kiểm tra dữ liệu giảng viên/xe.';
        setConflictWarning([message]);
        showScheduleToast(message, 'error');
        setIsSavingLesson(false);
        return;
      }

      setFormInstructorId(safeInstructorId);
      setFormVehicleId(safeVehicleId);

      const payload = {
        id: editingLessonId || undefined,
        studentId: formStudentId,
        instructorId: safeInstructorId,
        vehicleId: safeVehicleId,
        date: formDate,
        startTime: formStart,
        endTime: formEnd,
        lessonType: formType,
        pickupLocation: formPickup,
        trainingLocation: formTraining,
        notes: isOverride ? `${formNotes} [Mực ghi cưỡng chế: ${overrideReason}]` : formNotes,
        status: formStatus,
        attendanceStatus: formAttendance,
        resultNote: formResult
      };

      // Verify overlays/conflicts unless they approved override
      if (!isOverride) {
        const check = checkLessonConflicts(payload, lessons, instructors, vehicles, settings, students);
        if (check.hasConflict) {
          setConflictWarning(check.reasons);
          setShowOverride(true);

          // Fetch Suggested Slots based on actual duration calculated from formStart and formEnd
          const startMin = formStart.split(':').map(Number);
          const endMin = formEnd.split(':').map(Number);
          const calculatedDuration = (endMin[0] * 60 + endMin[1]) - (startMin[0] * 60 + startMin[1]);
          const finalDuration = calculatedDuration > 0 ? calculatedDuration : 120;

          const options = suggestAvailableSlots(
            {
              studentId: formStudentId,
              instructorId: safeInstructorId,
              vehicleId: safeVehicleId,
              date: formDate,
              duration: finalDuration // minutes
            },
            lessons,
            instructors,
            vehicles,
            settings
          );
          setConflictAlternatives(options);
          showScheduleToast('Hệ thống phát hiện xung đột lịch học. Vui lòng xem khung cảnh báo màu đỏ trong form.', 'warning');
          setIsSavingLesson(false);
          return; // Halt save
        }
      }

      const result = editingLessonId
        ? await updateLesson(editingLessonId, payload)
        : await addLesson(payload);

      if (!result?.success) {
        const message = result?.error || 'Không thể lưu lịch học. Vui lòng kiểm tra lại dữ liệu hoặc quyền truy cập.';
        setConflictWarning([message]);
        setShowOverride(false);
        showScheduleToast(message, 'error');
        return;
      }

      setConflictWarning([]);
      setConflictAlternatives([]);
      setShowOverride(false);
      setOverrideReason('');
      setSelectedDate(payload.date);
      setViewType('day');
      setIsBooking(false);
      showScheduleToast(
        `Đã lưu lịch học ngày ${payload.date} từ ${payload.startTime} đến ${payload.endTime}.`,
        'success'
      );
    } catch (err: any) {
      const message = err?.message || 'Lỗi không xác định khi lưu lịch học.';
      setConflictWarning([message]);
      setShowOverride(false);
      showScheduleToast(message, 'error');
    } finally {
      setIsSavingLesson(false);
    }
  };

  // Drag and drop demo helper (Move tomorrow)
  const shiftLessonDateDemo = (les: Lesson) => {
    const d = new Date(les.date);
    d.setDate(d.getDate() + 1);
    const dateStr = d.toISOString().split('T')[0];
    const confirmMove = window.confirm(`[Mô phỏng kéo thả] Bạn có muốn dời lịch của học viên sang ngày hôm sau (${new Date(dateStr).toLocaleDateString('vi-VN')}): ${les.startTime} - ${les.endTime}?`);
    if (confirmMove) {
      const check = checkLessonConflicts(
        { ...les, date: dateStr },
        lessons,
        instructors,
        vehicles,
        settings,
        students
      );
      if (check.hasConflict) {
        alert(`Không thể dời lịch tự động: ${check.reasons.join(', ')}`);
      } else {
        updateLesson(les.id, { date: dateStr });
        alert('Đã dời dợt lịch học thành công.');
      }
    }
  };

  const handleApplyAlternative = (alt: { date: string; startTime: string; endTime: string }) => {
    setFormDate(alt.date);
    setFormStart(alt.startTime);
    setFormEnd(alt.endTime);
    // Clear warning
    setConflictWarning([]);
    setConflictAlternatives([]);
    setShowOverride(false);
  };

  return (
    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-5">
      
      {/* Header action bar */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">QUẢN LÝ LỊCH HỌC</h1>
          <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
            Phân bổ trực quan giảng viên, xe tập lái và điểm danh tích lũy
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Excel Button */}
          <button
            onClick={() => exportScheduleToExcel(getActiveLessons(), students, instructors, vehicles, `LHP_LICH_HOC_${viewType}.csv`)}
            className="bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white px-4 py-3.5 rounded-2xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all text-center self-start sm:self-auto uppercase"
            title="Xuất bảng tính Excel lịch học hiện tại đang lọc"
          >
            <Download className="h-4 w-4" />
            <span>Xuất Excel</span>
          </button>

          {/* Export PDF Button */}
          <button
            onClick={() => printSchedulePDF(getActiveLessons(), students, instructors, vehicles, getActiveTitle())}
            className="bg-slate-700 hover:bg-slate-800 font-bold text-xs text-white px-4 py-3.5 rounded-2xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all text-center self-start sm:self-auto uppercase"
            title="In thời khóa biểu / lưu PDF chuẩn A4"
          >
            <Printer className="h-4 w-4" />
            <span>In Lịch Học</span>
          </button>

          <button
            onClick={handleOpenNewBooking}
            className="bg-blue-600 hover:bg-blue-700 font-bold text-xs text-white px-4 py-3.5 rounded-2xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all self-start sm:self-auto uppercase"
          >
            <Plus className="h-5 w-5" />
            XẾP LỊCH TRỰC TIẾP
          </button>
        </div>
      </div>

      {/* Date controls and View selectors */}
      <div className="bg-white p-3 border border-slate-100 shadow-xs rounded-3xl flex flex-col xl:flex-row justify-between items-center gap-4">
        
        {/* Date Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => adjustDate(-1)}
            className="p-2 border border-slate-100 hover:bg-slate-50 rounded-xl cursor-pointer"
          >
            <ChevronLeft className="h-4.5 w-4.5 text-slate-600" />
          </button>
          
          <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800">
            <CalendarIcon className="h-4 w-4 text-blue-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-0 focus:outline-none cursor-pointer text-xs"
            />
          </div>

          <button
            onClick={() => adjustDate(1)}
            className="p-2 border border-slate-100 hover:bg-slate-50 rounded-xl cursor-pointer"
          >
            <ChevronRight className="h-4.5 w-4.5 text-slate-600" />
          </button>

          <button
            onClick={() => setSelectedDate(getTodayString())}
            className="text-xs font-bold text-blue-600 hover:underline px-2"
          >
            Hôm nay ({new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})
          </button>
        </div>

        {/* Quick Toggles and Teacher Filter */}
        <div className="flex flex-wrap items-center gap-3.5 w-full xl:w-auto justify-center xl:justify-start">
          {/* Day / Week Quick Toggle Buttons */}
          <div className="flex bg-slate-50 p-1 rounded-xl text-[11px] font-bold text-slate-500 shadow-inner border border-slate-200/50">
            <button
              onClick={() => setViewType('day')}
              className={`py-1.5 px-3 rounded-lg transition-all cursor-pointer ${
                viewType === 'day' ? 'bg-white text-blue-600 shadow-xs font-black' : 'hover:text-slate-800'
              }`}
            >
              Chế Độ Ngày
            </button>
            <button
              onClick={() => setViewType('week')}
              className={`py-1.5 px-3 rounded-lg transition-all cursor-pointer ${
                viewType === 'week' ? 'bg-white text-blue-600 shadow-xs font-black' : 'hover:text-slate-800'
              }`}
            >
              Chế Độ Tuần
            </button>
          </div>

          {/* Instructor filter select dropdown */}
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 font-mono tracking-wider">Lọc Giáo Viên:</span>
            <select
              value={filterInstructorId}
              onChange={(e) => setFilterInstructorId(e.target.value)}
              className="bg-slate-50 border border-slate-200/80 rounded-xl py-1.5 px-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-xs min-w-[150px]"
            >
              <option value="all">Tất cả giáo viên</option>
              {instructors.map((ins) => (
                <option key={ins.id} value={ins.id}>
                  {ins.name} ({ins.phone})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View selection tabs */}
        <div className="flex bg-slate-50 p-1 rounded-2xl text-xs font-bold text-slate-500 overflow-x-auto w-full xl:w-auto justify-center xl:justify-start">
          {[
            { id: 'list', label: 'Dạng danh sách' },
            { id: 'week', label: 'Lịch Tuần (Lưới)' },
            { id: 'day', label: 'Theo Ngày' },
            { id: 'by_instructor', label: 'Theo Giảng Viên' },
            { id: 'by_vehicle', label: 'Theo Xe Tập' }
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setViewType(v.id as any)}
              className={`py-2 px-3 rounded-xl transition-all shrink-0 cursor-pointer ${viewType === v.id ? 'bg-white text-blue-600 shadow-xs font-extrabold' : 'hover:text-slate-800'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* RENDER VIEW CONTROLLER */}
      {viewType === 'list' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Gõ tên học viên để tìm nhanh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 pl-11 pr-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
            />
          </div>

          {/* DESKTOP TABLE LAYOUT */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs font-bold border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-widest bg-slate-50/50">
                  <th className="py-3 px-4">Ngày giờ</th>
                  <th className="py-3 px-4">Học viên</th>
                  <th className="py-3 px-4">Giáo viên phụ trách</th>
                  <th className="py-3 px-4">Xe phân công</th>
                  <th className="py-3 px-4">Sa hình/Đường trường</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700 font-bold">
                {displayedLessons
                  .filter(l => {
                    if (!searchQuery) return true;
                    const studentObj = students.find(s => s.id === l.studentId);
                    return studentObj?.name.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .sort((a,b)=> b.date.localeCompare(a.date))
                  .map((les) => {
                    const student = students.find(s => s.id === les.studentId);
                    const instructor = instructors.find(i => i.id === les.instructorId);
                    const car = vehicles.find(v => v.id === les.vehicleId);

                    let statusBadge = 'bg-blue-50 text-blue-750 border-blue-100';
                    if (les.status === 'Đã hoàn thành') statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                    if (les.status.includes('nghỉ') || les.status === 'Hủy lịch') statusBadge = 'bg-red-50 text-red-700 border-red-100';

                    return (
                      <tr key={les.id} className="hover:bg-slate-50/40">
                        <td className="py-3.5 px-4 font-bold">
                          <div className="font-extrabold text-slate-800">{new Date(les.date).toLocaleDateString('vi-VN')}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{les.startTime} - {les.endTime}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-slate-850 uppercase text-[11px] font-black">{student?.name}</div>
                          <span className="text-[10px] text-slate-400 font-mono">{student?.code}</span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-650">{instructor?.name}</td>
                        <td className="py-3.5 px-4">
                          <div>{car?.name}</div>
                          <span className="text-[10px] text-slate-400 uppercase">{car?.plate}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-bold">{les.lessonType}</td>
                        <td className="py-3.5 px-4">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${statusBadge}`}>
                            {les.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex justify-center items-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditBooking(les)}
                              className="text-[10px] bg-slate-100 border border-slate-200 hover:bg-slate-200 px-2 py-1 rounded-md text-slate-700 cursor-pointer"
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() => shiftLessonDateDemo(les)}
                              className="text-[10px] bg-blue-50 border border-blue-100 hover:bg-blue-105 px-2 py-1 rounded-md text-blue-700 cursor-pointer md:block hidden"
                              title="Kiểm tra kéo dời lịch"
                            >
                              Dời +1D
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* MOBILE FRIENDLY LESSON CARDS STACK */}
          <div className="block md:hidden space-y-4">
            {displayedLessons
              .filter(l => {
                if (!searchQuery) return true;
                const studentObj = students.find(s => s.id === l.studentId);
                return studentObj?.name.toLowerCase().includes(searchQuery.toLowerCase());
              })
              .sort((a,b)=> b.date.localeCompare(a.date))
              .map((les) => renderLessonCard(les))}
          </div>
        </div>
      )}

      {viewType === 'day' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block">Sơ đồ bận rộn ngày: {new Date(selectedDate).toLocaleDateString('vi-VN')}</span>
          
          {displayedLessons.filter(l => l.date === selectedDate).length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-xs">
              Không có chương trình bổ túc lái xe nào được xếp cho ngày này.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedLessons
                .filter(l => l.date === selectedDate)
                .sort((a,b)=>a.startTime.localeCompare(b.startTime))
                .map((les) => {
                  const student = students.find(s => s.id === les.studentId);
                  const teacher = instructors.find(i => i.id === les.instructorId);
                  const car = vehicles.find(v => v.id === les.vehicleId);

                  return (
                    <div
                      key={les.id}
                      onClick={() => handleOpenEditBooking(les)}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-200 cursor-pointer shadow-xs transition-all space-y-2.5"
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-slate-200/55">
                        <span className="text-xs text-blue-600 font-extrabold flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {les.startTime} - {les.endTime}
                        </span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-extrabold">
                          {les.status}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="text-sm font-black text-slate-800 uppercase">{student?.name}</div>
                        <div className="text-xs text-slate-500 font-bold">Lớp: {les.lessonType}</div>
                      </div>

                      <div className="text-xs text-slate-400 space-y-0.5 pt-1 border-t border-slate-105">
                        <div>Thầy: <strong>{teacher?.name}</strong></div>
                        <div>Xe tập: <strong>{car?.plate}</strong> ({car?.name})</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {viewType === 'by_instructor' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block">Theo Giảng viên ngày {new Date(selectedDate).toLocaleDateString('vi-VN')}</span>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {instructors
              .filter(ins => filterInstructorId === 'all' || ins.id === filterInstructorId)
              .map((ins) => {
                const insLessons = displayedLessons.filter(l => l.date === selectedDate && l.instructorId === ins.id);
              return (
                <div key={ins.id} className="border border-slate-100 rounded-3xl p-4 bg-slate-50/50 space-y-3">
                  <div className="pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-800 block uppercase">{ins.name}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{ins.phone}</span>
                  </div>

                  <div className="space-y-2">
                    {insLessons.length === 0 ? (
                      <div className="text-[10px] text-center text-slate-400 py-4 font-bold border border-dashed border-slate-200 rounded-xl bg-white">
                        Trống lịch dạy
                      </div>
                    ) : (
                      insLessons.map((les) => (
                        <div
                          key={les.id}
                          onClick={() => handleOpenEditBooking(les)}
                          className="bg-white p-3 border border-slate-100 rounded-2xl cursor-pointer hover:border-blue-150 text-[11px] font-bold"
                        >
                          <div className="text-blue-600 font-extrabold">{les.startTime} - {les.endTime}</div>
                          <div className="text-slate-800 font-black mt-1 uppercase">{students.find(s=>s.id === les.studentId)?.name}</div>
                          <div className="text-slate-450 mt-0.5">{les.lessonType}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewType === 'by_vehicle' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block font-mono">Bảng bận rộn Xe ngày {new Date(selectedDate).toLocaleDateString('vi-VN')}</span>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {vehicles.map((veh) => {
              const vehLessons = displayedLessons.filter(l => l.date === selectedDate && l.vehicleId === veh.id);
              return (
                <div key={veh.id} className="border border-slate-100 rounded-3xl p-4 bg-slate-50/55 space-y-3">
                  <div className="pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-800 block uppercase leading-snug">{veh.name}</span>
                    <span className="text-[9px] bg-indigo-120 text-blue-800 font-extrabold uppercase px-1.5 py-0.5 rounded border border-blue-200">{veh.plate}</span>
                  </div>

                  <div className="space-y-2">
                    {vehLessons.length === 0 ? (
                      <div className="text-[10px] text-center text-slate-400 py-4 font-bold border border-dashed border-slate-200 rounded-xl bg-white">
                        Trống xe tập lái
                      </div>
                    ) : (
                      vehLessons.map((les) => (
                        <div
                          key={les.id}
                          onClick={() => handleOpenEditBooking(les)}
                          className="bg-white p-3 border border-slate-100 rounded-2xl cursor-pointer hover:border-blue-150 text-[11px] font-bold space-y-1"
                        >
                          <div className="text-blue-600 font-black">{les.startTime} - {les.endTime}</div>
                          <div className="text-slate-800 uppercase">{students.find(s=>s.id === les.studentId)?.name}</div>
                          <div className="text-slate-400 font-medium">{les.lessonType}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewType === 'week' && (() => {
        const startOfWeek = getMondayOfDate(selectedDate);
        const weekDays = Array.from({ length: 7 }).map((_, i) => {
          const nextDay = new Date(startOfWeek);
          nextDay.setDate(startOfWeek.getDate() + i);
          const isoString = nextDay.toISOString().split('T')[0];
          const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
          return {
            dateStr: isoString,
            dayLabel: dayNames[nextDay.getDay()],
            displayDate: `${nextDay.getDate().toString().padStart(2, '0')}/${(nextDay.getMonth() + 1).toString().padStart(2, '0')}`
          };
        });

        const allWeekLessons = displayedLessons.filter(l => 
          weekDays.some(wd => wd.dateStr === l.date)
        );

        return (
          <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4 text-left">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-black text-slate-800 uppercase tracking-widest block font-mono">
                  CHẾ ĐỘ XEM LƯỚI TUẦN (WEEKLY GRID VIEW)
                </span>
                <p className="text-[11px] text-slate-500 font-semibold leading-relaxed mt-1">
                  Quan sát các ca học, thầy dạy & xe tập lái để tối ưu sắp xếp, tránh việc bị trùng lặp tài nguyên dạy học. Nhấp vào buổi dạy để sửa nhanh lịch học.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-650 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
                <span>Cảnh báo trùng lặp tự động</span>
              </div>
            </div>

            {/* Horizontal scroll grid representing the 7 columns of the week */}
            <div className="overflow-x-auto pb-4">
              <div className="grid grid-cols-7 gap-3.5 min-w-[1200px]">
                {weekDays.map((wd) => {
                  const dayLessons = allWeekLessons
                    .filter(l => l.date === wd.dateStr)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));

                  const isSelectedDay = wd.dateStr === selectedDate;
                  const isToday = wd.dateStr === new Date().toISOString().split('T')[0];

                  return (
                    <div
                      key={wd.dateStr}
                      className={`flex flex-col rounded-2xl border min-h-[500px] bg-slate-50/25 ${
                        isSelectedDay
                          ? 'border-blue-400 bg-blue-50/10'
                          : isToday
                          ? 'border-emerald-400 bg-emerald-50/10'
                          : 'border-slate-100'
                      }`}
                    >
                      {/* Day Column Header */}
                      <div
                        className={`p-3 rounded-t-2xl text-center border-b ${
                          isSelectedDay
                            ? 'bg-blue-600 text-white border-blue-600'
                            : isToday
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 text-slate-700 border-slate-100'
                        }`}
                      >
                        <span className="block text-xs font-black uppercase tracking-tight">{wd.dayLabel}</span>
                        <span className="text-[10px] opacity-90 font-mono tracking-wider">{wd.displayDate}</span>
                      </div>

                      {/* Day Content Lessons Column Stack */}
                      <div className="p-2 space-y-2.5 flex-1 flex flex-col justify-start">
                        {dayLessons.length === 0 ? (
                          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-xl p-4 text-center text-slate-400 select-none min-h-[120px] bg-white/50">
                            <span className="text-lg mb-1">📅</span>
                            <span className="text-[10px] font-bold">Trống ca học</span>
                          </div>
                        ) : (
                          dayLessons.map((les) => {
                            const student = students.find(s => s.id === les.studentId);
                            const teacher = instructors.find(i => i.id === les.instructorId);
                            const car = vehicles.find(v => v.id === les.vehicleId);
                            const conflicts = getWeekLessonConflicts(les, allWeekLessons);
                            const hasConflict = conflicts.length > 0;

                            return (
                              <div
                                key={les.id}
                                onClick={() => handleOpenEditBooking(les)}
                                className={`text-[11px] font-semibold p-3 rounded-xl border text-left cursor-pointer transition-all hover:shadow-xs hover:scale-[1.01] ${
                                  hasConflict
                                    ? 'bg-red-50 border-red-300 shadow-sm shadow-red-100/50 hover:bg-red-100/50'
                                    : 'bg-white border-slate-150 hover:border-blue-300'
                                }`}
                              >
                                {/* Time marker block */}
                                <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                                  <span className="text-blue-600 font-extrabold flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> {les.startTime} - {les.endTime}
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                                    les.status === 'Đã hoàn thành'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : les.status.includes('nghỉ') || les.status === 'Hủy lịch'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-slate-150 text-slate-700'
                                  }`}>
                                    {les.status === 'Đã hoàn thành' ? 'Xong' : les.status === 'Đã xác nhận' ? 'Duyệt' : 'Chờ'}
                                  </span>
                                </div>

                                {/* Student name */}
                                <div className="pt-2 text-slate-900 font-extrabold uppercase text-xs truncate" title={student?.name}>
                                  {student?.name || 'Vô danh'}
                                </div>

                                {/* Class and type */}
                                <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                                  Hạng: <span className="text-slate-600">{student?.licenseClass || 'B2'}</span> • {les.lessonType}
                                </div>

                                {/* Teacher & Car Details */}
                                <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 space-y-0.5">
                                  <div className="truncate">
                                    👨‍🏫 GV: <span className="text-slate-700 font-bold">{teacher?.name || 'Chưa gán'}</span>
                                  </div>
                                  <div className="truncate">
                                    🚗 Xe: <span className="text-slate-700 font-bold">{car?.plate || 'AT'}</span> ({car?.name || 'Vios'})
                                  </div>
                                </div>

                                {/* Overlapping conflicts panel */}
                                {hasConflict && (
                                  <div className="mt-2.5 p-1.5 bg-red-150 text-red-900 rounded-lg text-[9px] leading-tight space-y-1 border border-red-200">
                                    <div className="flex items-center gap-1 font-black uppercase tracking-wider text-red-800">
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                      <span>Trùng ca học!</span>
                                    </div>
                                    <ul className="list-disc pl-3 font-bold text-[9px] text-red-800 space-y-0.5">
                                      {conflicts.map((c, idx) => (
                                        <li key={idx} className="break-words">{c.label}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL WORKFLOW FORM: LẬP KHUNG BUỔI DẠY */}
      {isBooking && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-xl overflow-hidden animate-zoom-in max-h-[92vh] flex flex-col">
            
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <CalendarIcon className="h-5 w-5 text-blue-600" /> {editingLessonId ? 'CẬP NHẬT LỊCH HỌC' : 'XẾP LỊCH HỌC TRỰC TIẾP'}
              </h2>
              <button
                onClick={() => setIsBooking(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            {/* Form Scrollable Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs font-bold">
              
              {/* Conflict Warnings Panel inside Form */}
              {conflictWarning.length > 0 && (
                <div className="p-3.5 bg-red-100/40 border border-red-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-red-700 font-black">
                    <AlertTriangle className="h-4.5 w-4.5" />
                    <span>HỆ THỐNG PHÁT HIỆN TRÙNG LỊCH/XUNG ĐỘT</span>
                  </div>
                  <ul className="list-disc pl-5 text-red-800 space-y-1 text-[11px] leading-relaxed">
                    {conflictWarning.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>

                  {/* Sugested Free Slots Selection */}
                  {conflictAlternatives.length > 0 && (
                    <div className="pt-2 border-t border-red-200/50">
                      <span className="text-[10px] text-slate-500 font-black block mb-1.5 uppercase">Chọn khung giờ trống đề xuất thay thế:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {conflictAlternatives.map((alt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleApplyAlternative(alt)}
                            className="text-[10px] py-1.5 px-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-lg cursor-pointer font-bold"
                          >
                            🕒 {alt.startTime} - {alt.endTime} ({new Date(alt.date).toLocaleDateString('vi-VN')})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={(e) => handleSaveLesson(e, false)} className="space-y-4">
                
                {/* Inputs Fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Học viên *</label>
                    <select
                      value={formStudentId}
                      onChange={(e) => {
                        const nextStudentId = e.target.value;
                        const student = students.find(s => s.id === nextStudentId);
                        setFormStudentId(nextStudentId);
                        setFormPickup(student?.address || 'Đón tại Trung tâm');
                        setFormInstructorId(getCompatibleInstructorId(student, student?.assignedInstructorId));
                        setFormVehicleId(getCompatibleVehicleId(student, student?.assignedVehicleId));
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-800 text-xs font-bold"
                    >
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Giảng viên *</label>
                    <select
                      value={formInstructorId}
                      onChange={(e) => setFormInstructorId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-800 text-xs font-bold"
                    >
                      {instructors.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Xe tập lái *</label>
                    <select
                      value={formVehicleId}
                      onChange={(e) => setFormVehicleId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-800 text-xs font-bold"
                    >
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Ngày học *</label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-slate-850"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Giờ học bắt đầu *</label>
                    <input
                      type="time"
                      required
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-slate-850 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Giờ kết thúc *</label>
                    <input
                      type="time"
                      required
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-slate-850 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Phân loại buổi học</label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-800 text-xs font-bold"
                    >
                      <option value="Làm quen xe">Làm quen xe</option>
                      <option value="Đường trường cơ bản">Đường trường cơ bản</option>
                      <option value="Đường trường nâng cao">Đường trường nâng cao</option>
                      <option value="Sa hình">Sa hình</option>
                      <option value="Bổ túc tay lái">Bổ túc tay lái</option>
                      <option value="Thi thử">Thi thử</option>
                      <option value="Khác">Phần khác</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Trạng thái khóa</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-850 text-xs"
                    >
                      <option value="Chờ xác nhận">Chờ xác nhận</option>
                      <option value="Đã xác nhận">Đã xác nhận</option>
                      <option value="Đã hoàn thành">Đã hoàn thành</option>
                      <option value="Học viên báo nghỉ">Học viên báo nghỉ</option>
                      <option value="Giảng viên báo nghỉ">Giảng viên báo nghỉ</option>
                      <option value="Hủy lịch">Hủy lịch tập</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Địa chỉ đón khách</label>
                    <input
                      type="text"
                      placeholder="e.g. Bến xe, Sảnh Đh..."
                      value={formPickup}
                      onChange={(e) => setFormPickup(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Địa điểm bãi tập</label>
                    <input
                      type="text"
                      placeholder="e.g. Sân thi Tây Mỗ..."
                      value={formTraining}
                      onChange={(e) => setFormTraining(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Kết luận nhận xét của Thầy dạy</label>
                  <input
                    type="text"
                    placeholder="e.g. Côn tốt, Nhạy ga, Sợ lùi chuồng dọc..."
                    value={formResult}
                    onChange={(e) => setFormResult(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 font-medium"
                  />
                </div>

                {/* OVERRIDE OVERLAY SECTION FOR ADMIN/STAFF */}
                {showOverride && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2.5">
                    <label className="block text-xs font-black text-amber-800 uppercase tracking-wide">
                      ⚡ GHI NHẬN CƯỠNG CHẾ (Override): Nhập lý do duyệt chồng chéo
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Giảng viên dạy bù, Ôn thi sát hạch gấp..."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-xl py-2 px-3 text-slate-800 text-xs"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => handleSaveLesson(e, true)}
                        disabled={!overrideReason}
                        className="bg-amber-600 hover:bg-amber-750 disabled:opacity-50 text-white font-bold text-xs py-2 px-4 rounded-xl cursor-pointer shadow-xs"
                      >
                        ✓ Đồng ý Ghi Chồng Lịch
                      </button>
                    </div>
                  </div>
                )}

                {/* Form Buttons */}
                {lastSaveMessage && (
                  <div className="text-[11px] font-bold rounded-xl bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 mb-2">
                    {lastSaveMessage}
                  </div>
                )}
                <div className="pt-3 border-t border-slate-100 flex gap-2.5 justify-between">
                  {editingLessonId && currentUser?.role !== 'Instructor' && (
                    <button
                      type="button"
                      onClick={() => {
                        const confDel = window.confirm('Quý khách muốn XÓA VĨNH VIỄN buổi học này? Thao tác không phục hồi.');
                        if (confDel) {
                          deleteLesson(editingLessonId);
                          setIsBooking(false);
                        }
                      }}
                      className="bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 py-2.5 px-4 rounded-xl cursor-pointer font-bold text-xs"
                    >
                      Xóa lịch
                    </button>
                  )}
                  
                  <div className="flex gap-2 ml-auto">
                    <button
                      type="button"
                      disabled={isSavingLesson}
                      onClick={() => setIsBooking(false)}
                      className="bg-slate-100 text-slate-700 hover:bg-slate-200 py-2.5 px-4 rounded-xl cursor-pointer disabled:opacity-50"
                    >
                      QUAY LẠI
                    </button>
                    
                    {!showOverride && (
                      <button
                        type="submit"
                        disabled={isSavingLesson}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white py-2.5 px-5 rounded-xl cursor-pointer shadow-xs transition-all"
                      >
                        {isSavingLesson ? 'ĐANG LƯU LỊCH...' : '✓ GHI LẠI LỊCH DẠY'}
                      </button>
                    )}
                  </div>
                </div>

              </form>

            </div>

          </div>
        </div>
      )}

      {/* QUICK RESCHEDULE MODAL */}
      {rescheduleLesson && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl p-5 space-y-4 animate-zoom-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <CalendarIcon className="h-5 w-5 text-blue-600 animate-bounce" /> Thay đổi lịch học
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

    </div>
  );
};
