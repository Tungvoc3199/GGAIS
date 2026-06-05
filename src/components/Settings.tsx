/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Settings as SettingsIcon, ShieldCheck, Sliders, DollarSign, Calendar, RefreshCcw, Database, Download, Sun, Moon } from 'lucide-react';

export const Settings: React.FC = () => {
  const {
    settings,
    updateSettings,
    resetToDefaultDemo,
    currentUser,
    students,
    instructors,
    vehicles,
    lessons,
    payments,
    auditLogs
  } = useDatabase();

  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  // Local settings clone
  const [schoolName, setSchoolName] = useState(settings.schoolName);
  const [tuitionA1, setTuitionA1] = useState(settings.tuitionPrices.A1);
  const [tuitionBAuto, setTuitionBAuto] = useState(settings.tuitionPrices['B số tự động']);
  const [tuitionBManual, setTuitionBManual] = useState(settings.tuitionPrices['B số sàn']);
  const [tuitionC1, setTuitionC1] = useState(settings.tuitionPrices.C1);

  const [workingStart, setWorkingStart] = useState(settings.autoSchedulingRules.workingHourStart);
  const [workingEnd, setWorkingEnd] = useState(settings.autoSchedulingRules.workingHourEnd);
  const [buffer, setBuffer] = useState(settings.autoSchedulingRules.safetyBufferMinutes);
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.theme || 'light');

  const handleBackupDatabase = () => {
    try {
      const backupData = {
        backupVersion: "1.0",
        backupTimestamp: new Date().toISOString(),
        backupDateFormatted: new Date().toLocaleString('vi-VN'),
        schoolName: schoolName || settings.schoolName || 'Trường lái xe LHP',
        data: {
          students,
          instructors,
          vehicles,
          lessons,
          payments,
          settings,
          auditLogs
        }
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      const cleanSchoolName = (schoolName || settings.schoolName || 'school_backup')
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_]+/g, '_');
      
      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      link.href = url;
      link.download = `backup_${cleanSchoolName}_${dateStr}_${timeStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const timestampNow = new Date().toLocaleTimeString('vi-VN');
      setBackupStatus(`Đã tải xuống bản sao lưu (.json) thành công lúc ${timestampNow}!`);
      setTimeout(() => setBackupStatus(null), 8500);
    } catch (err) {
      console.error(err);
      alert('Đã xảy ra lỗi trong quá trình xuất dữ liệu sao lưu.');
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role !== 'Admin') {
      alert('Chỉ tài khoản quản trị viên tối cao (Admin) mới có quyền ghi đè cấu hình trung tâm.');
      return;
    }

    updateSettings({
      schoolName,
      tuitionPrices: {
        A1: tuitionA1,
        A: tuitionA1, // match
        'B số tự động': tuitionBAuto,
        'B số sàn': tuitionBManual,
        C1: tuitionC1
      },
      autoSchedulingRules: {
        workingHourStart: workingStart,
        workingHourEnd: workingEnd,
        safetyBufferMinutes: buffer,
        maxLessonsPerStudentPerDay: 1
      },
      theme
    });

    alert('Đã cập nhật thay đổi cấu hình trường học thành công!');
  };

  const handleResetData = () => {
    const ok = window.confirm('Quý khách muốn đặt lại TOÀN BỘ số liệu về dữ liệu mô phỏng ban đầu? Các học viên mới và giao dịch thêm tay sẽ bị hủy.');
    if (ok) {
      resetToDefaultDemo();
      alert('Đã khôi phục trạng thái chuẩn thành công. Vui lòng tải lại trang.');
      window.location.reload();
    }
  };

  return (
    <div className="font-sans py-4 px-2 max-w-4xl mx-auto space-y-6">
      
      {/* Header section */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">CÀI ĐẶT HỆ THỐNG</h1>
        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
          Phân bổ bảng giá học phí theo hạng bằng và thiết lập giới hạn thuật toán xếp ca
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-5 text-xs font-bold font-sans">
        
        {/* School Name block */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-4">
          <h2 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Sliders className="h-4.5 w-4.5 text-blue-600" /> Thông tin Đơn vị Đào Tạo
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Tên trường lái / Tên thầy giáo đại diện</label>
              <input
                type="text"
                required
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Giao diện hiển thị (Tránh chói mắt)</label>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all border flex items-center justify-center gap-2 cursor-pointer select-none ${
                    theme === 'light'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Sun className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>Sáng (Ban ngày)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all border flex items-center justify-center gap-2 cursor-pointer select-none ${
                    theme === 'dark'
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Moon className="h-4 w-4 shrink-0 text-indigo-300" />
                  <span>Tối (Ban đêm)</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tuition Prices Config */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-4">
          <h2 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <DollarSign className="h-4.5 w-4.5 text-blue-600" /> Bảng giá biểu phí mặc định (VND)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Học phí lý thuyết Hạng A1</label>
              <input
                type="number"
                value={tuitionA1}
                onChange={(e) => setTuitionA1(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Trọn gói thi hạng B (Tự động - B1)</label>
              <input
                type="number"
                value={tuitionBAuto}
                onChange={(e) => setTuitionBAuto(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Trọn gói thi hạng B (Số sàn - B2)</label>
              <input
                type="number"
                value={tuitionBManual}
                onChange={(e) => setTuitionBManual(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Trọn gói xe tải Hạng C</label>
              <input
                type="number"
                value={tuitionC1}
                onChange={(e) => setTuitionC1(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Engine controls */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-4">
          <h2 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Calendar className="h-4.5 w-4.5 text-blue-600" /> Thiết lập tham số Thuật toán Xếp ca
          </h2>

          <div className="grid grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Giờ mở cửa bãi tập</label>
              <input
                type="time"
                value={workingStart}
                onChange={(e) => setWorkingStart(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Giờ đóng cửa bãi tập</label>
              <input
                type="time"
                value={workingEnd}
                onChange={(e) => setWorkingEnd(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Khoảng đệm an toàn (Phút)</label>
              <input
                type="number"
                value={buffer}
                onChange={(e) => setBuffer(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-850"
              />
            </div>
          </div>
        </div>

        {/* Database Backup & Extra Safety Module */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-4 text-left">
          <h2 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Database className="h-4.5 w-4.5 text-blue-600" /> BẢO MẬT & SAO LƯU DỰ LIỆU CỤC BỘ
          </h2>

          <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="space-y-1 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-50 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border border-blue-100">
                    Khuyên dùng định kỳ
                  </span>
                  <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border border-emerald-100">
                    Ngoại tuyến & An toàn
                  </span>
                </div>
                <h4 className="text-xs font-black text-slate-755 uppercase tracking-wide mt-1.5">Xuất dữ liệu toàn hệ thống (.json)</h4>
                <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                  Tải xuống tệp sao lưu dữ liệu trung tâm tức thời bao gồm: thông tin chi tiết của học viên, sơ đồ đặt lịch, danh mục giáo viên xếp ca, tất cả giao dịch biên nhận tài chính và nhật trình bảo trì định kỳ của xe tập lái.
                </p>
              </div>

              <button
                type="button"
                onClick={handleBackupDatabase}
                className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs py-3 px-5 rounded-2xl cursor-pointer shadow-md transition-all uppercase flex items-center justify-center gap-2 select-none self-stretch md:self-center shrink-0"
              >
                <Download className="h-4.5 w-4.5" />
                Tải bản sao dạng JSON
              </button>
            </div>

            {backupStatus && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-2xl flex items-center gap-2 animate-zoom-in text-xs font-bold shadow-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                <span>{backupStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action button triggers */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100 gap-3">
          <button
            type="button"
            onClick={handleResetData}
            className="bg-red-50 hover:bg-red-100 text-red-650 font-bold py-2.5 px-4 rounded-xl cursor-pointer flex items-center gap-1.5 transition-all"
          >
            <RefreshCcw className="h-4 w-4" /> Đặt lại dữ liệu mẫu
          </button>

          {currentUser?.role === 'Admin' && (
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-5 rounded-2xl cursor-pointer shadow-sm transition-all text-xs"
            >
              ✓ LƯU CẤU HÌNH ĐƠN VỊ
            </button>
          )}
        </div>

      </form>

    </div>
  );
};
