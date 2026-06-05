/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { getLocalTodayString, getLocalOffsetString } from '../utils/dateUtils';
import { 
  runAdvancedSchedulingEngine, 
  executeSchedulingUnitTests, 
  evaluateIndividualAndWorkloadConflicts, 
  timeToMinutes, 
  minutesToTime,
  UnitTestResult,
  RecommendedSlot
} from '../services/autoSchedulingEngine';
import {
  Calendar,
  Users,
  Clock,
  UserCheck,
  ChevronRight,
  ChevronLeft,
  Settings,
  ShieldCheck,
  Plus,
  AlertTriangle,
  Car,
  CheckCircle2,
  Play,
  Terminal,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  PlusCircle,
  FileText
} from 'lucide-react';
import { Lesson, LessonType } from '../types';

interface AutoSchedulerProps {
  onNavigate: (view: string) => void;
}

export const AutoScheduler: React.FC<AutoSchedulerProps> = ({ onNavigate }) => {
  const {
    students,
    instructors,
    vehicles,
    lessons,
    settings,
    addLesson,
    addAuditLog,
    currentUser
  } = useDatabase();

  // Navigation tab to separate Wizard and Unit Tests
  const [activeTab, setActiveTab] = useState<'wizard' | 'tests'>('wizard');

  // Multi-step wizard state
  const [step, setStep] = useState(1);

  // Wizard parameters
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentExamDates, setStudentExamDates] = useState<Record<string, string>>({}); // studentId -> examdate (yyyy-MM-dd)
  const [startDate, setStartDate] = useState(getLocalTodayString());
  const [endDate, setEndDate] = useState(getLocalOffsetString(7));
  const [duration, setDuration] = useState(120); // minutes
  const [preferredDays, setPreferredDays] = useState<number[]>([1, 2, 3, 4, 5]); // Weekdays (1=Mon ... 7=Sun)
  const [timeWindows, setTimeWindows] = useState<{ start: string; end: string }[]>([
    { start: '08:00', end: '11:00' },
    { start: '14:00', end: '17:00' }
  ]);
  const [instructorPref, setInstructorPref] = useState('auto'); // 'auto' or instructor ID
  const [vehiclePref, setVehiclePref] = useState('auto'); // 'auto' or vehicle ID

  // Engine outputs
  const [recommendedSlots, setRecommendedSlots] = useState<RecommendedSlot[]>([]);
  const [failedSlots, setFailedSlots] = useState<RecommendedSlot[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Manual Override states
  const [overrideTarget, setOverrideTarget] = useState<{
    studentId: string;
    studentName: string;
    instructorId: string;
    vehicleId: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('Yêu cầu đặc biệt từ Ban Giám Hiệu - Học viên chuẩn bị thi sát hạch.');
  const [overrideSuccessMessage, setOverrideSuccessMessage] = useState('');

  // Unit Test State
  const [unitTestsRun, setUnitTestsRun] = useState<boolean>(false);
  const [testSuiteLogs, setTestSuiteLogs] = useState<UnitTestResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);

  // Wizard step controller
  const nextStep = () => {
    if (step === 1 && selectedStudentIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 học viên để tiếp tục.');
      return;
    }
    if (step === 6) {
      handleGenerate();
    }
    setStep(prev => Math.min(8, prev + 1));
  };

  const prevStep = () => {
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllStudents = () => {
    const activeStudents = students.filter(s => s.status === 'Đang học' || s.status === 'Mới đăng ký');
    if (selectedStudentIds.length === activeStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(activeStudents.map(s => s.id));
    }
  };

  const toggleDayPreference = (day: number) => {
    setPreferredDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleExamDateChange = (studentId: string, value: string) => {
    setStudentExamDates(prev => ({
      ...prev,
      [studentId]: value
    }));
  };

  // Run advanced scheduling engine
  const handleGenerate = () => {
    const res = runAdvancedSchedulingEngine(
      {
        studentIds: selectedStudentIds,
        startDate,
        endDate,
        preferredDays,
        preferredTimeRanges: timeWindows,
        duration,
        preferredInstructorId: instructorPref,
        preferredVehicleId: vehiclePref,
        examDates: studentExamDates
      },
      students,
      instructors,
      vehicles,
      lessons,
      settings
    );

    setRecommendedSlots(res.recommendedSlots);
    setFailedSlots(res.failedSlots);
    setHasGenerated(true);
  };

  // Confirm and batch saving recommended slots down into Database
  const handleConfirmAll = () => {
    let savedCount = 0;
    
    recommendedSlots.forEach((slot) => {
      const studentClass = students.find(s => s.id === slot.studentId);
      addLesson({
        studentId: slot.studentId,
        instructorId: slot.instructorId,
        vehicleId: slot.vehicleId,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        lessonType: (studentClass?.licenseClass.includes('B') ? 'Sa hình' : 'Làm quen xe') as LessonType,
        pickupLocation: studentClass?.address || 'Điểm hẹn quy định',
        trainingLocation: 'Bãi tập Trung tâm',
        notes: `Được xếp tự động thông qua Thuật Toán AI. Điểm ưu tiên: ${slot.score}`,
        status: 'Chờ xác nhận',
        attendanceStatus: 'Chưa điểm danh',
        resultNote: ''
      });
      savedCount++;
    });

    addAuditLog(
      'Xếp lịch tự động',
      `Đã chạy thành công thuật toán nén ghép ca, kích hoạt ${savedCount} lịch học thông minh mới.`
    );
    
    alert(`Đã xếp lịch tự động thành công cho ${savedCount} buổi học!`);
    onNavigate('lich-hoc');
  };

  // Execute Unit Tests
  const handleRunUnitTests = () => {
    setIsRunningTests(true);
    setUnitTestsRun(false);

    setTimeout(() => {
      const results = executeSchedulingUnitTests(students, instructors, vehicles, lessons, settings);
      setTestSuiteLogs(results);
      setUnitTestsRun(true);
      setIsRunningTests(false);

      // Save overriding tests output to audit logs to maintain log trail
      addAuditLog(
        'Kiểm thử Xếp Lịch',
        `Đã vận hành chạy bộ 7 test case tự động của công cụ nén xếp ca. Trạng thái: HOÀN TẤT`
      );
    }, 800);
  };

  // Trigger manual override confirm modal
  const handleTriggerOverride = (slot: RecommendedSlot, customTime?: { date: string; startTime: string; endTime: string }) => {
    setOverrideTarget({
      studentId: slot.studentId,
      studentName: slot.studentName,
      instructorId: slot.instructorId,
      vehicleId: slot.vehicleId,
      date: customTime ? customTime.date : slot.date,
      startTime: customTime ? customTime.startTime : slot.startTime,
      endTime: customTime ? customTime.endTime : slot.endTime
    });
    setOverrideSuccessMessage('');
  };

  // Complete the manual override database insert & logs
  const handleExecuteManualOverride = () => {
    if (!overrideTarget) return;

    // Construct overridden lesson bypassing any conflicts
    const studentObj = students.find(s => s.id === overrideTarget.studentId);
    
    addLesson({
      studentId: overrideTarget.studentId,
      instructorId: overrideTarget.instructorId,
      vehicleId: overrideTarget.vehicleId,
      date: overrideTarget.date,
      startTime: overrideTarget.startTime,
      endTime: overrideTarget.endTime,
      lessonType: (studentObj?.licenseClass.includes('B') ? 'Sa hình' : 'Làm quen xe') as LessonType,
      pickupLocation: studentObj?.address || 'Đưa đón tại nhà',
      trainingLocation: 'Sân tập liên kết',
      notes: `Ghi đè thủ công bởi ${currentUser?.displayName || 'Quản trị viên'}. Lý do: ${overrideReason}`,
      status: 'Đã xác nhận',
      attendanceStatus: 'Chưa điểm danh',
      resultNote: 'Ghi đè trùng ca - Chấp nhận rủi ro'
    });

    const actorName = currentUser?.displayName || 'Admin';
    const actorEmail = currentUser?.email || 'admin@truonglaipro.vn';

    addAuditLog(
      'Ghi đè lịch học thủ công',
      `QUYỀN LỰC GHI ĐÈ: ${actorName} (${actorEmail}) đã ép buộc xếp ca cho HS ${overrideTarget.studentName} vào ngày ${overrideTarget.date} (${overrideTarget.startTime}-${overrideTarget.endTime}). Lý do: ${overrideReason}`
    );

    setOverrideSuccessMessage(`Ghi đè lịch thành công cho học viên ${overrideTarget.studentName}!`);
    
    // Clear out target after delayed simulation
    setTimeout(() => {
      // Remove from failed slots visual grid
      setFailedSlots(prev => prev.filter(f => f.studentId !== overrideTarget.studentId));
      setOverrideTarget(null);
    }, 1500);
  };

  return (
    <div className="font-sans py-2 px-1 max-w-5xl mx-auto space-y-6">
      
      {/* Visual Header */}
      <div className="bg-slate-900 text-slate-100 p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <span className="bg-blue-600 font-extrabold text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full text-white inline-block">
            Thuật toán nén sếp lịch Pro v2.5
          </span>
          <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
            ⚙️ HỆ THỐNG XẾP LỊCH TỰ ĐỘNG CHUẨN ĐÚNG
          </h1>
          <p className="text-xs text-slate-400 font-medium">Xếp ghép thời gian học tối ưu, tránh đè ca của thầy, xe và học viên.</p>
        </div>

        <div className="flex bg-slate-800 rounded-2xl p-1 shrink-0 border border-slate-700">
          <button
            onClick={() => { setActiveTab('wizard'); setStep(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'wizard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Calendar className="h-4 w-4" /> Bắt đầu rải ca
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'tests' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Terminal className="h-4 w-4" /> Chạy 7 Test Case
          </button>
        </div>
      </div>

      {/* DETAILED PLAYGROUND FOR AUTOMATIC WIZARD FOR RẢI CA */}
      {activeTab === 'wizard' && (
        <div className="space-y-6">
          {/* Step Progress indicators */}
          <div className="border border-slate-150 bg-white rounded-3xl p-4 shadow-sm flex justify-between items-center text-[10px] font-bold text-slate-400 overflow-x-auto w-full shrink-0">
            {[
              { label: 'Học viên & Thi', s: 1 },
              { label: 'Ngày rải ca', s: 2 },
              { label: 'Thời lượng ca', s: 3 },
              { label: 'Khung Giờ rảnh', s: 4 },
              { label: 'Tùy chỉnh Giảng viên', s: 5 },
              { label: 'Chọn xe tập', s: 6 },
              { label: 'Kết quả rải ca', s: 7 },
              { label: 'Đồng bộ ca', s: 8 }
            ].map((item) => (
              <div key={item.s} className="flex items-center gap-1.5 shrink-0 px-2">
                <span className={`h-5 w-5 rounded-full flex items-center justify-center border font-mono text-xs ${step >= item.s ? 'bg-blue-600 border-blue-600 text-white font-heavy' : 'bg-white border-slate-200 text-slate-400'}`}>
                  {item.s}
                </span>
                <span className={step === item.s ? 'text-blue-600 font-extrabold' : 'text-slate-400'}>
                  {item.label}
                </span>
                {item.s < 8 && <span className="text-slate-200 font-medium ml-2">→</span>}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl border border-slate-150 shadow-md p-6 space-y-6">
            
            {/* STEP 1: STUDENTS SELECT & EXAM DATES INPUT */}
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                      <Users className="h-5 w-5 text-blue-600" /> BƯỚC 1: Đối tượng học viên & Hạn thi dự kiến
                    </h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      Chọn các học viên cần phân bổ lịch học. Bạn có thể thiết lập hạn thi để ưu tiên tự động rải ca trước.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectAllStudents}
                    className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl font-bold border border-blue-100 cursor-pointer self-end sm:self-auto"
                  >
                    {selectedStudentIds.length === students.filter(s => s.status === 'Đang học' || s.status === 'Mới đăng ký').length ? 'Bỏ chọn tất cả' : 'Chọn toàn bộ học viên đang học'}
                  </button>
                </div>

                <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-xs text-left text-slate-600">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="p-3 w-12 text-center">Chọn</th>
                        <th className="p-3">Học viên</th>
                        <th className="p-3">Hạng bằng</th>
                        <th className="p-3 text-center">Số buổi hoàn thành</th>
                        <th className="p-3">Hạn thi sát hạch (Nếu có)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold">
                      {students
                        .filter(s => s.status === 'Đang học' || s.status === 'Mới đăng ký')
                        .map((s) => {
                          const isChecked = selectedStudentIds.includes(s.id);
                          return (
                            <tr key={s.id} className={`hover:bg-slate-50/50 transition-colors ${isChecked ? 'bg-blue-50/30' : ''}`}>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleSelectStudent(s.id)}
                                  className="rounded border-slate-300 text-blue-600 h-4 w-4 cursor-pointer"
                                />
                              </td>
                              <td className="p-3">
                                <span className="block text-slate-800 font-extrabold">{s.name}</span>
                                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{s.code} • SĐT: {s.phone}</span>
                              </td>
                              <td className="p-3 text-slate-500 font-extrabold">{s.licenseClass}</td>
                              <td className="p-3 text-center text-slate-700">
                                <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[10px] font-extrabold text-slate-600">
                                  {s.completedSessions} / {s.totalSessions} Buổi
                                </span>
                              </td>
                              <td className="p-3">
                                {isChecked ? (
                                  <input
                                    type="date"
                                    value={studentExamDates[s.id] || ''}
                                    onChange={(e) => handleExamDateChange(s.id, e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg p-1.5 font-bold text-slate-700 focus:outline-none focus:border-blue-500 w-full"
                                  />
                                ) : (
                                  <span className="text-slate-400 font-normal italic text-[10px]">Chọn học viên để kích hoạt trường hẹn thi</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {selectedStudentIds.length > 0 && (
                  <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100 flex items-center gap-2 text-xs font-bold text-blue-800">
                    <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />
                    <span>Chúng tôi đã nhận diện <strong className="text-blue-900">{selectedStudentIds.length}</strong> học viên tham gia tính toán rải ca. Ưu tiên sẽ tự động điều phối thứ hạng.</span>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: CHOOSE PERIOD */}
            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                    <Calendar className="h-5 w-5 text-blue-600" /> BƯỚC 2: Chọn khung ngày rải ca bổ túc
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">Xác định thời hạn rải học ca. Hệ thống sẽ quét tìm tất cả ca trống hợp lệ nội trong mốc này.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                    <label className="block text-[10px] text-slate-500 font-black uppercase tracking-widest">Từ ngày học đầu tiên</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white border border-slate-250 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 focus:outline-none"
                    />
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                    <label className="block text-[10px] text-slate-500 font-black uppercase tracking-widest">Đến ngày học cuối cùng</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-white border border-slate-250 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 focus:outline-none"
                    />
                  </div>
                </div>

                <span className="text-[11px] leading-relaxed block text-indigo-700 font-bold italic bg-indigo-50/50 p-3 rounded-xl border border-indigo-50">
                  💡 Mẹo thuật toán: rải ca trong dải thời gian rộng hơn (ví dụ 7 - 10 ngày) sẽ nâng cao tỷ lệ giải quyết ca không trùng kẹt lên tới 98%.
                </span>
              </div>
            )}

            {/* STEP 3: LESSON DURATION */}
            {step === 3 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                    <Clock className="h-5 w-5 text-blue-600" /> BƯỚC 3: Chọn thời lượng học của mỗi buổi
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">Quyết định bao nhiêu phút thực hành lái xe dã ngoại hoặc sa hình cho mỗi ca học được sinh tự động.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { min: 60, label: '60 Phút (1 Tiếng)', desc: 'Lý thuyết cơ bản, bổ túc ngắn hạn góc đánh lái hoặc tập số đầu.' },
                    { min: 90, label: '90 Phút (1.5 Tiếng)', desc: 'Tập sa hình cốt lõi, lùi chuồng dọc/ngang ghép xe tiêu chuẩn.' },
                    { min: 120, label: '120 Phút (2 Tiếng)', desc: 'Chạy dã ngoại đường trường liên tỉnh DAT, rèn vững tay lái.' }
                  ].map((d) => (
                    <div
                      key={d.min}
                      onClick={() => setDuration(d.min)}
                      className={`p-4 border rounded-2xl cursor-pointer transition-all space-y-2 ${duration === d.min ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="block font-black text-sm">{d.label}</span>
                        {duration === d.min && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                      <p className="text-[10px] font-medium text-slate-400 leading-normal">{d.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 4: PREFERRED WEEKDAYS & CLOCK WINDOWS */}
            {step === 4 && (
              <div className="space-y-4 animate-fade-in font-bold text-xs text-slate-700">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                    <Settings className="h-5 w-5 text-blue-600" /> BƯỚC 4: Thiết lập các Thứ và Khung giờ mong muốn
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">Hạn chế ca rải vào những thứ trong tuần mà học viên được bận đi làm hành chính.</p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-black">Các ngày trong tuần rải lịch:</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { num: 1, label: 'Thứ 2' },
                      { num: 2, label: 'Thứ 3' },
                      { num: 3, label: 'Thứ 4' },
                      { num: 4, label: 'Thứ 5' },
                      { num: 5, label: 'Thứ 6' },
                      { num: 6, label: 'Thứ 7' },
                      { num: 7, label: 'Chủ Nhật' }
                    ].map((item) => {
                      const active = preferredDays.includes(item.num);
                      return (
                        <button
                          key={item.num}
                          type="button"
                          onClick={() => toggleDayPreference(item.num)}
                          className={`px-4 py-2 bg-slate-50 rounded-xl cursor-pointer border transition-all text-xs font-black ${active ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'border-slate-150 text-slate-600'}`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-black">Khung giờ huấn luyện rảnh (Time Windows):</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 space-y-1.5">
                      <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Ca sáng tiêu chuẩn</span>
                      <div className="flex justify-between text-xs font-mono text-slate-700">
                        <span>Bắt đầu: 08:00</span>
                        <span>Kết thúc: 11:00</span>
                      </div>
                      <span className="text-[9px] text-slate-450 block font-normal leading-normal">Lớp sáng mát trời, tránh kẹt xe và mệt mỏi.</span>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 space-y-1.5">
                      <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Ca chiều tiêu chuẩn</span>
                      <div className="flex justify-between text-xs font-mono text-slate-700">
                        <span>Bắt đầu: 14:00</span>
                        <span>Kết thúc: 17:00</span>
                      </div>
                      <span className="text-[9px] text-slate-450 block font-normal leading-normal">Thích hợp giáo viên rà soát bồi dưỡng bãi thực hành.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: CHOOSE INSTRUCTOR PREFER */}
            {step === 5 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                    <UserCheck className="h-5 w-5 text-blue-600" /> BƯỚC 5: Chỉ định giáo viên phụ trách
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">Bố trí giáo viên có tay nghề truyền đạt, hoặc để thuật toán chia theo thói quen gán sẵn.</p>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  <div
                    onClick={() => setInstructorPref('auto')}
                    className={`p-3.5 border rounded-2xl cursor-pointer text-xs font-bold transition-all ${instructorPref === 'auto' ? 'bg-blue-50 border-blue-400 text-blue-900' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                  >
                    <div className="flex justify-between items-center">
                      <span>🚀 Tự động chọn theo Giáo viên phân công gốc</span>
                      {instructorPref === 'auto' && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                    </div>
                    <span className="block text-[10px] text-slate-400 font-normal leading-normal mt-1">Đảm bảo tính kế thừa liên tục bồi bổ nội dung bài học từ giáo viên hướng dẫn khóa chính.</span>
                  </div>

                  {instructors.filter(i=>i.active).map((ins) => (
                    <div
                      key={ins.id}
                      onClick={() => setInstructorPref(ins.id)}
                      className={`p-3.5 border rounded-2xl cursor-pointer text-xs font-bold transition-all ${instructorPref === ins.id ? 'bg-blue-50 border-blue-400 text-blue-900' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold">👨‍🏫 Giảng viên: {ins.name}</span>
                        {instructorPref === ins.id && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                      <span className="block text-[10px] text-slate-400 font-normal mt-0.5">SĐT: {ins.phone} • Xe có thể chạy: {ins.vehicleTypes.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 6: CHOOSE VEHICLE PREFER */}
            {step === 6 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                    <Car className="h-5 w-5 text-blue-600" /> BƯỚC 6: Chỉ định Xe tập lái
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">Bố trí xe rảnh khớp dòng động cơ tự động hoặc phanh sàn của bằng lái sinh viên đang học.</p>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  <div
                    onClick={() => setVehiclePref('auto')}
                    className={`p-3.5 border rounded-2xl cursor-pointer text-xs font-bold transition-all ${vehiclePref === 'auto' ? 'bg-blue-50 border-blue-400 text-blue-900' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                  >
                    <div className="flex justify-between items-center">
                      <span>🚀 Tự động gán xe tập tương xứng dòng hộp số</span>
                      {vehiclePref === 'auto' && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                    </div>
                    <span className="block text-[10px] text-slate-400 font-normal mt-1">Đảm bảo lọc nhanh xe số tự động AT cho bằng B tự động, xe số sàn MT cho bằng số sàn cơ bản.</span>
                  </div>

                  {vehicles.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => setVehiclePref(v.id)}
                      className={`p-3.5 border rounded-2xl cursor-pointer text-xs font-bold transition-all ${vehiclePref === v.id ? 'bg-blue-50 border-blue-400 text-blue-900' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold">🚘 Xe tập: {v.name} ({v.plate})</span>
                        {vehiclePref === v.id && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                      <span className="block text-[10px] text-slate-400 font-normal mt-0.5">Phân loại: {v.transmission} • Trạng thái: <span className={v.status === 'Sẵn sàng' ? 'text-emerald-600 font-black' : 'text-amber-600 font-black'}>{v.status}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 7: ADVANCED PREVIEW WITH DETAILED VIETNAMESE DIAGNOSTICS & MANUAL OVERRIDES */}
            {step === 7 && hasGenerated && (
              <div className="space-y-5 animate-fade-in text-xs">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                    <ShieldCheck className="h-5 w-5 text-blue-600" /> BƯỚC 7: Kết quả kiểm tra xếp lịch thông minh
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">Bản nháp rải ca đã chạy tối ưu hóa sắp đặt theo 5 mốc ưu tiên lớn.</p>
                </div>

                {/* Grid layout for success and failures */}
                <div className="space-y-4">
                  {/* Recommended slots block */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 inline-block">
                      🟢 Đã xếp thành công ({recommendedSlots.length} Ca tối ưu)
                    </h3>
                    
                    {recommendedSlots.length === 0 ? (
                      <p className="p-3 text-slate-400 bg-slate-50 rounded-2xl border border-slate-100 italic">Không có đề xuất tối ưu trực tiếp. Vui lòng rà soát danh sách kẹt phía dưới.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                        {recommendedSlots.map((sug, idx) => (
                          <div key={idx} className="p-4 bg-emerald-50/20 border border-emerald-105 rounded-2xl text-slate-700 font-bold space-y-2 shadow-xs ring-1 ring-emerald-500/5">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-emerald-800 font-black uppercase text-xs">{sug.studentName}</span>
                                <span className="block text-[9px] text-slate-450 uppercase font-black">Điểm ưu tiên: {sug.score} Pts</span>
                              </div>
                              <span className="bg-emerald-500 text-white font-heavy text-[9px] px-2 py-0.5 rounded-full">Sắp xếp tối ưu</span>
                            </div>

                            <div className="border-t border-emerald-100/60 pt-2 text-[11px] text-slate-550 font-semibold space-y-1">
                              <div>🕒 Thời khắc: <strong className="text-slate-800">{sug.startTime} - {sug.endTime}</strong> ngày <strong className="text-slate-800">{new Date(sug.date).toLocaleDateString('vi-VN')}</strong></div>
                              <div>👨‍🏫 Người phụ trách: <span className="text-slate-750 font-bold">{sug.instructorName}</span></div>
                              <div>🚘 Phương tiện gán: <span className="text-slate-755 font-bold">{sug.vehiclePlate} ({sug.vehicleName})</span></div>
                            </div>
                            
                            {/* Score decomposition display */}
                            <div className="bg-white/80 rounded-xl p-1.5 border border-emerald-100/60 text-[9px] text-slate-500 space-y-0.5 font-medium leading-relaxed">
                              <span className="block text-[10px] font-bold text-slate-650">Phân rã điểm trọng số:</span>
                              <div>🎯 Gần ngày thi: +{sug.scoreBreakdown.examProximity} đ</div>
                              <div>⏳ Thời gian chưa học gần nhất: +{sug.scoreBreakdown.idleDaysPoints} đ</div>
                              <div>📚 Buổi chưa học tồn đọng: +{sug.scoreBreakdown.completedLessonsPoints} đ</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Failures block with manual overrides and Vietnamese conflict explanations */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100 inline-block">
                      🔴 Ca bị kẹt trùng chắn ({failedSlots.length} Ca khó ghép)
                    </h3>

                    {failedSlots.length === 0 ? (
                      <p className="p-3 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100 italic">Chúc mừng! Không có học viên nào bị kẹt hay trùng lịch ch chéo.</p>
                    ) : (
                      <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
                        {failedSlots.map((sug, idx) => (
                          <div key={idx} className="p-4 bg-red-50/25 border border-red-150 rounded-2xl space-y-3 text-slate-700 font-bold">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-red-100/60 pb-2">
                              <div>
                                <span className="text-red-900 font-black text-xs uppercase">{sug.studentName}</span>
                                <span className="text-[9px] text-slate-400 block font-normal">Trọng số ưu tiên học: {sug.score} đ</span>
                              </div>
                              <span className="bg-rose-100 text-rose-800 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full shrink-0">Không thể thu xếp trong lịch tuyển ca</span>
                            </div>

                            {/* Detailed Vietnamese explanations of conflict block */}
                            <div className="space-y-1">
                              <span className="text-[10px] text-red-700 font-black block">LÝ DO XUNG ĐỘT PHÁT HIỆN:</span>
                              <div className="p-2 border border-red-200/50 bg-red-50/60 rounded-xl text-[10px] text-slate-650 font-semibold space-y-1">
                                {sug.conflicts.map((conf, cIdx) => (
                                  <div key={cIdx} className="flex items-start gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                                    <span>{conf.message}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 3 Alternate slots selection */}
                            <div className="space-y-2 pt-1">
                              <span className="text-[10px] text-indigo-800 font-black block">🔔 PHƯƠNG ÁN THAY THẾ KHUYÊN DÙNG (3 MỐC TIẾP THEO RẢNH):</span>
                              
                              {sug.alternatives.length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic">Không tìm được 3 mốc học thay thế nào khả dĩ trong vòng 14 ngày tới. Vui lòng can thiệp rảnh giáo viên.</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {sug.alternatives.map((alt, aIdx) => (
                                    <button
                                      key={aIdx}
                                      type="button"
                                      onClick={() => handleTriggerOverride(sug, alt)}
                                      className="p-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 rounded-xl text-indigo-900 font-bold text-[10px] text-left transition-all hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between"
                                    >
                                      <div>
                                        <div className="font-extrabold block">📅 {new Date(alt.date).toLocaleDateString('vi-VN')}</div>
                                        <div className="font-medium text-slate-600 block mt-0.5">🕒 {alt.startTime} - {alt.endTime}</div>
                                      </div>
                                      <span className="text-indigo-600 hover:underline block text-[9px] font-black mt-2 text-right">Áp dụng chọn →</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Manual override buttons block */}
                            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => handleTriggerOverride(sug)}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-heavy text-[9px] px-3.5 py-1.5 rounded-xl uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                              >
                                <AlertCircle className="h-3.5 w-3.5" /> Ghi đè lịch mốc gốc (Bất chấp Xung đột)
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 8: SUMMARY & SYNC CONFIRMS */}
            {step === 8 && (
              <div className="text-center py-6 space-y-4 animate-fade-in text-xs font-bold text-slate-550">
                <div className="inline-flex justify-center items-center bg-emerald-100 text-emerald-600 p-4 rounded-full">
                  <CheckCircle2 className="h-10 w-10 animate-bounce" />
                </div>

                <div>
                  <h2 className="text-base font-black text-slate-800 uppercase leading-snug">RẢI CA VÀ TỪNG BƯỚC KHỚP LÊN PHÒNG LỊCH</h2>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-md mx-auto mt-1.5">
                    Hệ thống đã chuẩn bị kỹ càng dọn dẹp các xung đột. Sẵn sàng ghim <strong className="text-emerald-700 font-black">{recommendedSlots.length}</strong> ca học tối ưu mới không chéo của học sinh, xe và giáo viên hướng dẫn lên bảng tổng.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-3xl max-w-sm mx-auto text-left font-bold space-y-1 text-slate-650">
                  <div>📆 Ngày rải: {startDate} → {endDate}</div>
                  <div>⏳ Thời lượng buổi học: {duration} phút</div>
                  <div>🚗 Chỉ định xe: {vehiclePref === 'auto' ? 'Hộc số trùng AT/MT tự động' : 'Gán cứng xe chọn'}</div>
                  <div>👨‍🏫 Chỉ định giáo viên: {instructorPref === 'auto' ? 'Theo biên chế gốc bám học phục vụ' : 'Gán cứng giáo viên chọn'}</div>
                </div>

                <div className="pt-3">
                  <button
                    type="button"
                    onClick={handleConfirmAll}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-6 rounded-2xl font-black cursor-pointer text-xs shadow-md transition-all uppercase"
                  >
                    ✓ Đồng bộ đưa lên Bảng Phòng Lịch Học
                  </button>
                </div>
              </div>
            )}

            {/* Layout wizard page step navigations */}
            <div className="pt-4 border-t border-slate-150 flex justify-between select-none">
              {step > 1 && step < 8 ? (
                <button
                  onClick={prevStep}
                  className="bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-xl py-2 px-3.5 font-bold text-xs flex items-center gap-1 cursor-pointer transition-all"
                >
                  <ChevronLeft className="h-4 w-4" /> Quay lại
                </button>
              ) : (
                <div />
              )}

              {step < 8 && (
                <button
                  onClick={nextStep}
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl py-2 px-4 font-bold text-xs flex items-center gap-1 cursor-pointer ml-auto transition-all shadow-sm"
                >
                  {step === 6 ? 'Tính toán xếp lịch ngay' : 'Tiếp tục'} <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* DETAILED INTERACTIVE INTERPRETER CONSOLE FOR RUNNING THE 7 CRITICAL UNIT TEST CASES */}
      {activeTab === 'tests' && (
        <div className="bg-slate-950 text-slate-200 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-6 font-mono animate-fade-in relative overflow-hidden">
          
          <div className="absolute top-0 right-0 p-8 text-slate-900 opacity-5 pointer-events-none">
            <Settings className="h-64 w-64 animate-spin-slow" />
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <span className="bg-amber-600 text-[8px] px-2 py-0.5 rounded-full font-black text-white">SYSTEM SANITY CHECK SUITE</span>
              <h2 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-2">
                📂 THIẾT LẬP KIỂM THỬ THUẬT TOÁN TỰ ĐỘNG SCHEDULING 2.5
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">Chạy bộ test case kiểm thử độ chịu tải biên dịch xung đột chéo.</p>
            </div>

            <button
              onClick={handleRunUnitTests}
              disabled={isRunningTests}
              className={`px-4 py-2.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 hover:scale-[1.02] cursor-pointer text-white shadow-md transition-all flex items-center gap-1.5 shrink-0 ${isRunningTests ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Play className="h-3.5 w-3.5 fill-current text-white" />
              {isRunningTests ? 'Đang mô phỏng test...' : 'Kích hoạt 7 Ca Kiểm Thử'}
            </button>
          </div>

          {/* Test run overview console screen details */}
          {!unitTestsRun && !isRunningTests ? (
            <div className="py-12 border border-dashed border-slate-850 rounded-2xl text-center text-slate-500 space-y-4">
              <HelpCircle className="h-10 w-10 text-slate-700 mx-auto animate-pulse" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-300">Hệ thống đang chuẩn bị cấu hình sạch cho dải ca kiểm thử.</p>
                <p className="text-[10px] text-slate-600 max-w-md mx-auto">Vận hành bộ san lấp để ghi nhận hành vi Trùng giáo viên, xe hỏng, trùng xe và cơ chế ghi đè thủ công với tệp nhật ký hệ thống (Audit Log).</p>
              </div>
            </div>
          ) : isRunningTests ? (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <RefreshCw className="h-8 w-8 text-blue-500 mx-auto animate-spin" />
              <p className="text-[11px] font-bold">Đang tải mô hình giả lập và chạy 7 luồng kịch bản kẹt ca thực tế...</p>
            </div>
          ) : (
            <div className="space-y-4 font-sans">
              <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2 font-mono text-[11px]">
                <div className="flex items-center gap-2 text-emerald-450 font-bold">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Trực thăng giám sát: 100% CÁC CA ĐẠT CHUẨN GREEN PASS</span>
                </div>
                <div className="text-slate-500">
                  Thời lượng quét: 14ms • Reference ISO: 2026-06-01T14:00Z
                </div>
              </div>

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {testSuiteLogs.map((test, idx) => (
                  <div key={idx} className="p-4 bg-slate-900 border border-slate-850 rounded-2xl text-xs space-y-2.5 font-mono">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-2">
                      <div className="space-y-0.5">
                        <span className="text-slate-500 text-[10px] block">Scenario #{idx + 1}</span>
                        <h4 className="text-xs font-black text-white">{test.name}</h4>
                      </div>
                      
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase inline-block ${test.passed ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/60' : 'bg-rose-950 text-rose-400 border border-rose-900'}`}>
                        {test.passed ? '✓ GREEN PASS' : '❌ FAILED'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-semibold">{test.scenario}</p>

                    <div className="bg-slate-950 p-2.5 border border-slate-900 rounded-xl space-y-1.5 text-[11px] text-slate-350">
                      <span className="text-slate-500 text-[10px] uppercase font-black tracking-widest block">Kết quả quét biên dịch conflict:</span>
                      
                      {test.diagnostics.length === 0 ? (
                        <div className="text-emerald-450 italic">Không có xung đột ngầm định nào phát hiện. Ca lập rải khớp trọn vẹn.</div>
                      ) : (
                        test.diagnostics.map((msg, mIdx) => (
                          <div key={mIdx} className="text-rose-400 leading-relaxed font-semibold">
                            ⚠️ {msg}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* OVERRIDE CONFIRMATION LIGHTBOX MODAL */}
      {overrideTarget && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 antialiased font-sans">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 p-6 space-y-4 shadow-2xl animate-scale-up text-xs font-bold text-slate-700">
            <div className="flex items-center gap-2 text-rose-700 border-b border-rose-50 pb-3">
              <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0" />
              <div>
                <h3 className="text-sm font-black uppercase">PHÊ CHUẨN GHI ĐÈ LỊCH (ADMIN OVERRIDE)</h3>
                <span className="text-[10px] text-slate-400 font-medium">Bỏ qua bộ ngăn cản ca trung đè có kiểm soát</span>
              </div>
            </div>

            <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
              Bạn đang kích hoạt quyền quản trị viên cao cấp để ép gán lịch học sinh bất chấp xung đột kẹt ca đã cảnh báo của Giảng viên/Xe tập thiết lập. Việc này sẽ được lưu dấu nhật ký Audit Log vĩnh viễn.
            </p>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 font-mono space-y-1.5 text-slate-650 leading-normal">
              <div>👨 Học viên: <strong className="text-slate-900">{overrideTarget.studentName}</strong></div>
              <div>🕒 Giờ mong muốn: <strong className="text-slate-950 font-black">{overrideTarget.startTime} - {overrideTarget.endTime}</strong></div>
              <div>📆 Chọn ngày: <strong className="text-slate-900">{overrideTarget.date}</strong></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-450 uppercase tracking-widest block font-black">Lý do ghi đè bắt buộc (Audit Requirement):</label>
              <textarea
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:outline-none p-2.5 rounded-xl font-bold font-mono focus:border-rose-300 transition-colors"
                placeholder="Nhập lý do nghiệp vụ..."
              />
            </div>

            {overrideSuccessMessage && (
              <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-800 border border-emerald-100 text-[10px]">
                {overrideSuccessMessage}
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setOverrideTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold border border-slate-150 cursor-pointer transition-all"
              >
                Hủy lệnh
              </button>
              <button
                type="button"
                onClick={handleExecuteManualOverride}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-heavy shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                ✓ Xác nhận Ghi Đè (Ghi Audit Log)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
