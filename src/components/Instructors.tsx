/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Instructor, LicenseClass } from '../types';
import {
  User,
  Plus,
  Phone,
  Briefcase,
  Layers,
  Sparkles,
  X,
  CreditCard,
  MapPin,
  Clock,
  Award
} from 'lucide-react';

export const Instructors: React.FC = () => {
  const {
    instructors,
    lessons,
    addInstructor,
    updateInstructor,
    currentUser
  } = useDatabase();

  const [isAdding, setIsAdding] = useState(false);

  // New Instructor States
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cert, setCert] = useState('SP-991223');
  const [experience, setExperience] = useState(5);
  const [selectedClasses, setSelectedClasses] = useState<LicenseClass[]>(['B số tự động', 'B số sàn']);
  const [status, setStatus] = useState<'Đang dạy' | 'Tạm nghỉ' | 'Nghỉ việc'>('Đang dạy');

  const handleClassToggle = (lc: LicenseClass) => {
    setSelectedClasses(prev =>
      prev.includes(lc) ? prev.filter(c => c !== lc) : [...prev, lc]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      alert('Vui lòng điền họ tên và số điện thoại.');
      return;
    }

    addInstructor({
      name,
      phone,
      teachingCertificate: cert,
      experienceYears: experience,
      vehicleTypes: selectedClasses,
      status
    });

    // Reset Form
    setName('');
    setPhone('');
    setIsAdding(false);
    alert('Đăng ký Giảng viên mới thành công!');
  };

  const handleChangeStatus = (id: string, newStat: any) => {
    updateInstructor(id, { status: newStat });
    alert('Đã cập nhật trạng thái hoạt động giảng viên.');
  };

  return (
    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-5">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ĐỘI NGŨ GIẢNG VIÊN</h1>
          <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
            Quản lý văn bằng sư phạm sát hạch lý thuyết và sa hình
          </p>
        </div>

        {currentUser?.role !== 'Instructor' && (
          <button
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 hover:bg-blue-700 font-bold text-xs text-white px-4 py-3 rounded-2xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all self-start sm:self-auto"
          >
            <Plus className="h-4.5 w-4.5" />
            THÊM GIẢNG VIÊN
          </button>
        )}
      </div>

      {/* Instructors list panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {instructors.map((ins) => {
          const finishedHours = lessons.filter(l => l.instructorId === ins.id && l.status === 'Đã hoàn thành').length * 2;
          
          let stateStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100';
          if (ins.status === 'Tạm nghỉ') stateStyle = 'bg-amber-50 text-amber-700 border-amber-100';
          if (ins.status === 'Nghỉ việc') stateStyle = 'bg-slate-100 text-slate-500 border-slate-200';

          return (
            <div key={ins.id} className="bg-white border border-slate-100 p-5 rounded-3xl shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-bold text-slate-450 font-mono tracking-widest uppercase">{ins.code}</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${stateStyle}`}>
                    {ins.status}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-800 uppercase leading-snug">{ins.name}</h3>
                  <div className="text-xs text-slate-500 font-bold flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-slate-400" /> {ins.phone}
                  </div>
                </div>

                <div className="space-y-2 text-xs font-bold pt-2 border-t border-slate-50">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Giảng dạy bằng:</span>
                    <span className="text-slate-750">{ins.vehicleTypes.join(', ')}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Số chứng chỉ SP:</span>
                    <span className="text-slate-750 font-mono">{ins.teachingCertificate}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Thâm niên lái xe:</span>
                    <span className="text-slate-750">{ins.experienceYears} năm kinh nghiệm</span>
                  </div>
                </div>
              </div>

              {/* Status toggles for Admin */}
              {currentUser?.role === 'Admin' && (
                <div className="pt-3 border-t border-slate-50 flex gap-1.5 justify-end">
                  <select
                    value={ins.status}
                    onChange={(e) => handleChangeStatus(ins.id, e.target.value as any)}
                    className="bg-slate-50 border border-slate-200 rounded-lg text-[10px] p-1.5 font-bold cursor-pointer"
                  >
                    <option value="Đang dạy">Đang hoạt động</option>
                    <option value="Tạm nghỉ">Phép / Tạm nghỉ</option>
                    <option value="Nghỉ việc">Đóng / Thôi việc</option>
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FORM DIALOG: ADD NEW INSTRUCTOR */}
      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-zoom-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <span className="text-sm font-black text-slate-800 uppercase flex items-center gap-1.5">
                <Award className="h-5 w-5 text-blue-600" /> ĐĂNG KÝ GIẢNG VIÊN MỚI
              </span>
              <button
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Họ và tên giảng viên *</label>
                <input
                  type="text"
                  required
                  placeholder="Thầy Nguyễn Văn ..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Số điện thoại liên hệ *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 0914..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Mã số chứng chỉ SP</label>
                  <input
                    type="text"
                    value={cert}
                    onChange={(e) => setCert(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Thâm niên công tác (Năm)</label>
                  <input
                    type="number"
                    value={experience}
                    onChange={(e) => setExperience(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800"
                  />
                </div>
              </div>

              {/* Checkboxes classes allowed */}
              <div>
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-2">Đủ thẩm quyền dạy hạng:</span>
                <div className="flex flex-wrap gap-2">
                  {(['A1', 'A', 'B số tự động', 'B số sàn', 'C1'] as LicenseClass[]).map((lc) => {
                    const active = selectedClasses.includes(lc);
                    return (
                      <button
                        key={lc}
                        type="button"
                        onClick={() => handleClassToggle(lc)}
                        className={`py-1.5 px-3 rounded-lg border text-[10px] font-black cursor-pointer transition-all ${active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                      >
                        {lc}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl cursor-pointer shadow-sm font-bold"
                >
                  ✓ ĐĂNG KÍ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
