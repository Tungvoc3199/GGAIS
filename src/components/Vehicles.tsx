/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Vehicle, LicenseClass } from '../types';
import {
  Car,
  Plus,
  Compass,
  Layers,
  Sparkles,
  X,
  CreditCard,
  Settings,
  ShieldAlert,
  Sliders,
  Gauge,
  Wrench,
  Calendar,
  AlertTriangle,
  FileText,
  CheckCircle,
  Clock,
  ClipboardList,
  Trash2,
  TrendingUp,
  Coins,
  Fuel,
  Activity
} from 'lucide-react';

export const Vehicles: React.FC = () => {
  const {
    vehicles,
    lessons,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    addAuditLog,
    currentUser
  } = useDatabase();

  const [isAdding, setIsAdding] = useState(false);

  // New Vehicle States
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('29A-667.12');
  const [transmission, setTransmission] = useState<'Số sàn' | 'Số tự động' | 'Khác'>('Số tự động');
  const [licenseClass, setLicenseClass] = useState<LicenseClass>('B số tự động');
  const [status, setStatus] = useState<'Đang hoạt động' | 'Đang bảo dưỡng' | 'Đang hỏng'>('Đang hoạt động');

  // New fields for initializing maintenance properties
  const [initMileage, setInitMileage] = useState<number | ''>('');
  const [initNextOilChangeMileage, setInitNextOilChangeMileage] = useState<number | ''>('');
  const [initNextOilChangeDate, setInitNextOilChangeDate] = useState<string>('');
  const [initLastMaintenanceDate, setInitLastMaintenanceDate] = useState<string>('');
  const [initMaintenanceNotes, setInitMaintenanceNotes] = useState<string>('');

  // Maintenance Edit Modal States
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editCurrentMileage, setEditCurrentMileage] = useState<number | ''>('');
  const [editNextOilChangeMileage, setEditNextOilChangeMileage] = useState<number | ''>('');
  const [editNextOilChangeDate, setEditNextOilChangeDate] = useState<string>('');
  const [editLastMaintenanceDate, setEditLastMaintenanceDate] = useState<string>('');
  const [editMaintenanceNotes, setEditMaintenanceNotes] = useState<string>('');

  // Tab selector
  const [activeTab, setActiveTab] = useState<'fleet' | 'expenses'>('fleet');

  // New Expense Modal / Form States
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [expenseVehicleId, setExpenseVehicleId] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<'Xăng xe' | 'Bảo dưỡng' | 'Đăng kiểm' | 'Chi phí khác'>('Xăng xe');
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');
  const [expenseDate, setExpenseDate] = useState('2026-06-03');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Expenses filter state
  const [filterVehicleId, setFilterVehicleId] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  // Confirmation modal for deleting vehicle
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);

  const [expenseToDelete, setExpenseToDelete] = useState<{
    vehicleId: string;
    expenseId: string;
    amount: number;
    category: string;
    vehicleName: string;
  } | null>(null);

  const handleDeleteExpense = (vehicleId: string, expenseId: string, amount: number, category: string) => {
    const parentVeh = vehicles.find(v => v.id === vehicleId);
    if (!parentVeh) return;
    setExpenseToDelete({
      vehicleId,
      expenseId,
      amount,
      category,
      vehicleName: parentVeh.name
    });
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseVehicleId || expenseAmount === '' || expenseAmount <= 0) {
      alert('Vui lòng nhập đầy đủ thông tin phương tiện và số tiền giá trị hợp lệ.');
      return;
    }
    const parentVeh = vehicles.find(v => v.id === expenseVehicleId);
    if (!parentVeh) return;

    const newExp = {
      id: 'exp_' + Date.now() + '_' + Math.floor(100 + Math.random() * 900),
      date: expenseDate,
      category: expenseCategory,
      amount: Number(expenseAmount),
      notes: expenseNotes
    };

    const updatedExpList = [...(parentVeh.expenses || []), newExp];
    updateVehicle(expenseVehicleId, { expenses: updatedExpList });

    await addAuditLog('Ghi nhận chi phí hoạt động xe', `Kê khai khoản chi loại ${expenseCategory} trị giá ${Number(expenseAmount).toLocaleString('vi-VN')} đ cho xe tập lái ${parentVeh.name} (${parentVeh.plate}).`);

    // Reset
    setExpenseAmount('');
    setExpenseNotes('');
    setIsAddingExpense(false);
    alert('Kê khai phiếu chi phí hoạt động của xe tập lái thành công!');
  };

  const getMaintenanceAlerts = (v: Vehicle) => {
    const today = new Date('2026-06-03');
    const alerts: string[] = [];

    if (v.currentMileage !== undefined && v.nextOilChangeMileage !== undefined) {
      const remainingKm = v.nextOilChangeMileage - v.currentMileage;
      if (remainingKm <= 0) {
        alerts.push(`Quá hạn thay dầu ${Math.abs(remainingKm).toLocaleString('vi-VN')} km!`);
      } else if (remainingKm <= 500) {
        alerts.push(`Sắp đến mốc thay dầu (còn ${remainingKm.toLocaleString('vi-VN')} km)`);
      }
    }

    if (v.nextOilChangeDate) {
      const nextDate = new Date(v.nextOilChangeDate);
      const diffTime = nextDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        alerts.push(`Quá hạn thay dầu ${Math.abs(diffDays)} ngày (hạn: ${v.nextOilChangeDate.split('-').reverse().join('/')})`);
      } else if (diffDays >= 0 && diffDays <= 7) {
        alerts.push(`Sắp tới mốc thay dầu (trong ${diffDays} ngày nữa - ${v.nextOilChangeDate.split('-').reverse().join('/')})`);
      }
    }

    return alerts;
  };

  const handleOpenEditMaintenance = (v: Vehicle) => {
    setEditingVehicle(v);
    setEditCurrentMileage(v.currentMileage ?? '');
    setEditNextOilChangeMileage(v.nextOilChangeMileage ?? '');
    setEditNextOilChangeDate(v.nextOilChangeDate || '');
    setEditLastMaintenanceDate(v.lastMaintenanceDate || '');
    setEditMaintenanceNotes(v.maintenanceNotes || '');
  };

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle) return;

    const currentMile = editCurrentMileage === '' ? undefined : Number(editCurrentMileage);
    const nextOilMile = editNextOilChangeMileage === '' ? undefined : Number(editNextOilChangeMileage);

    const updatedData: Partial<Vehicle> = {
      currentMileage: currentMile,
      nextOilChangeMileage: nextOilMile,
      nextOilChangeDate: editNextOilChangeDate || undefined,
      lastMaintenanceDate: editLastMaintenanceDate || undefined,
      maintenanceNotes: editMaintenanceNotes
    };

    updateVehicle(editingVehicle.id, updatedData);

    await addAuditLog(
      'Cập nhật bảo dưỡng',
      `Thay đổi thông số cơ học & bảo dưỡng xe ${editingVehicle.name} [${editingVehicle.plate}]. Mileage: ${currentMile?.toLocaleString('vi-VN') || 0} km, Mốc thay dầu kế: ${nextOilMile?.toLocaleString('vi-VN') || 0} km.`
    );

    setEditingVehicle(null);
    alert('Cập nhật nhật ký bảo dưỡng thành công!');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !plate) {
      alert('Vui lòng điền đầy đủ tên xe và biển số kiểm soát.');
      return;
    }

    // Plate format checks
    const plateRegex = /^[0-9]{2}[A-Z]-[0-9]{3,5}(\.[0-9]{2})?$/;
    if (!plateRegex.test(plate.toUpperCase().replace(/\s/g, ''))) {
      const ok = window.confirm(`Nhắc nhở: Biển số "${plate}" có dạng lạ so với định dạng xe Việt Nam phổ thông (e.g. 29A-123.45). Bạn có muốn tiếp tục lưu?`);
      if (!ok) return;
    }

    addVehicle({
      name,
      plate: plate.toUpperCase(),
      transmission,
      suitableLicenseClass: licenseClass,
      status,
      currentMileage: initMileage === '' ? undefined : Number(initMileage),
      nextOilChangeMileage: initNextOilChangeMileage === '' ? undefined : Number(initNextOilChangeMileage),
      nextOilChangeDate: initNextOilChangeDate || undefined,
      lastMaintenanceDate: initLastMaintenanceDate || undefined,
      maintenanceNotes: initMaintenanceNotes || undefined
    });

    // Reset Form
    setName('');
    setPlate('');
    setInitMileage('');
    setInitNextOilChangeMileage('');
    setInitNextOilChangeDate('');
    setInitLastMaintenanceDate('');
    setInitMaintenanceNotes('');
    setIsAdding(false);
    alert('Đăng ký xe tập lái mới thành công!');
  };

  const handleUpdateStatus = (id: string, newStat: any) => {
    updateVehicle(id, { status: newStat });
    alert('Đã đồng bộ trạng thái kỹ thuật của xe tập thành công.');
  };

  return (
    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-5">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">QUẢN LÝ XE TẬP LÁI</h1>
          <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
            Theo dõi trạng thái hao mòn kỹ thuật, phục vụ xếp lịch sát hạch sa hình
          </p>
        </div>

        {activeTab === 'fleet' && currentUser?.role !== 'Instructor' && (
          <button
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 hover:bg-blue-700 font-bold text-xs text-white px-4 py-3 rounded-2xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all self-start sm:self-auto"
          >
            <Plus className="h-4.5 w-4.5" />
            ĐĂNG KÝ XE TẬP
          </button>
        )}
      </div>

      {/* Tab Selectors */}
      <div className="border-b border-slate-100 flex items-center justify-between">
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('fleet')}
            className={`cursor-pointer px-4.5 py-3 text-xs uppercase font-black tracking-wider border-b-2 transition-all flex items-center gap-2 ${activeTab === 'fleet' ? 'border-blue-600 text-blue-700 font-black' : 'border-transparent text-slate-400 hover:text-slate-650 font-bold'}`}
          >
            <Car className="h-4.5 w-4.5" />
            Đội xe tập lái ({vehicles.length})
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`cursor-pointer px-4.5 py-3 text-xs uppercase font-black tracking-wider border-b-2 transition-all flex items-center gap-2 ${activeTab === 'expenses' ? 'border-blue-600 text-blue-700 font-black' : 'border-transparent text-slate-400 hover:text-slate-650 font-bold'}`}
          >
            <Coins className="h-4.5 w-4.5" />
            Báo cáo chi phí hoạt động
          </button>
        </div>

        {activeTab === 'expenses' && currentUser?.role !== 'Instructor' && (
          <button
            onClick={() => {
              if (vehicles.length === 0) {
                alert('Vui lòng tạo ít nhất 1 xe tập lái trước khi ghi chi phí.');
                return;
              }
              setExpenseVehicleId(vehicles[0].id);
              setIsAddingExpense(true);
            }}
            className="mb-1 bg-indigo-600 hover:bg-indigo-700 font-black text-[11px] text-white px-3.5 py-2.5 rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all text-left"
          >
            <Plus className="h-4 w-4" />
            GHI CHI PHÍ MỚI
          </button>
        )}
      </div>

      {activeTab === 'fleet' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v) => {
            const matchingLessons = lessons.filter(l => l.vehicleId === v.id && l.status === 'Đã hoàn thành').length;
            
            let stateColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
            if (v.status === 'Đang bảo dưỡng') stateColor = 'bg-amber-50 text-amber-700 border-amber-100';
            if (v.status === 'Đang hỏng') stateColor = 'bg-red-50 text-red-700 border-red-150';

            return (
              <div key={v.id} className="bg-white border border-slate-100 p-5 rounded-3xl shadow-xs space-y-4 flex flex-col justify-between">
                
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold text-slate-400 font-mono tracking-widest bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">{v.code}</span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${stateColor}`}>
                      {v.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                      <Car className="h-5 w-5 text-blue-600 shrink-0" /> {v.name}
                    </h3>
                    <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-slate-400" /> Biển số: <strong className="text-slate-700 font-mono uppercase">{v.plate}</strong>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs font-bold pt-2 border-t border-slate-50">
                    <div className="flex justify-between border-b border-dashed border-slate-100 pb-1.5">
                      <span className="text-slate-400 font-semibold">Công nghệ hộp số:</span>
                      <span className="text-slate-755">{v.transmission}</span>
                    </div>
                    <div className="flex justify-between border-b border-dashed border-slate-100 pb-1.5">
                      <span className="text-slate-400 font-semibold">Tập cho Hạng Bằng:</span>
                      <span className="text-slate-755 inline-block bg-blue-50/50 text-blue-700 text-[10px] px-1.5 rounded font-black">{v.suitableLicenseClass}</span>
                    </div>
                    <div className="flex justify-between border-b border-dashed border-slate-100 pb-1.5 text-slate-400 font-semibold">
                      <span>Số buổi đã chạy:</span>
                      <span className="text-slate-700">{matchingLessons} buổi học</span>
                    </div>
                  </div>

                  {/* Maintenance info section */}
                  <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-black uppercase text-[10px] tracking-wider flex items-center gap-1">
                        <Wrench className="h-3.5 w-3.5 text-blue-600" /> BẢO DƯỠNG ĐỊNH KỲ
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenEditMaintenance(v)}
                        className="text-blue-600 hover:text-blue-800 font-black uppercase text-[9px] flex items-center gap-1 transition-all cursor-pointer bg-blue-50 hover:bg-blue-105 rounded px-2.5 py-1"
                      >
                        <Sliders className="h-3 w-3" />
                        Cập nhật
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-slate-50 p-2.5 rounded-2xl border border-slate-100 font-bold text-slate-650">
                      <div>
                        <span className="text-[9px] text-slate-400 block font-extrabold uppercase">Số Km hiện tại</span>
                        <span className="text-slate-800 font-mono font-black text-xs leading-normal">
                          {v.currentMileage !== undefined ? `${v.currentMileage.toLocaleString('vi-VN')} km` : 'Chưa nhập'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-extrabold uppercase">Mốc thay dầu kế</span>
                        <span className="text-slate-800 font-mono font-black text-xs leading-normal">
                          {v.nextOilChangeMileage !== undefined ? `${v.nextOilChangeMileage.toLocaleString('vi-VN')} km` : 'Chưa nhập'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-extrabold uppercase">Thay dầu kế tiếp</span>
                        <span className="text-slate-755">
                          {v.nextOilChangeDate ? v.nextOilChangeDate.split('-').reverse().join('/') : 'Chưa nhập'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-extrabold uppercase">Lần bảo dưỡng gần nhất</span>
                        <span className="text-slate-755">
                          {v.lastMaintenanceDate ? v.lastMaintenanceDate.split('-').reverse().join('/') : 'Chưa nhập'}
                        </span>
                      </div>
                    </div>

                    {/* Display alerts if any */}
                    {(() => {
                      const alerts = getMaintenanceAlerts(v);
                      if (alerts.length === 0) return null;
                      return (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[10.5px] p-2.5 rounded-2xl space-y-1 font-bold shadow-2xs">
                          <div className="flex items-center gap-1 text-amber-900 uppercase text-[9px] tracking-wider">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            Yêu cầu bảo trì:
                          </div>
                          {alerts.map((al, idx) => (
                            <div key={idx} className="pl-4 text-[10px] leading-normal">• {al}</div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Maintenance record note */}
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 space-y-1">
                      <div className="text-[9px] text-slate-400 uppercase tracking-widest font-black flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5 text-slate-500" /> Nhật ký bảo dưỡng:
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed italic line-clamp-3">
                        {v.maintenanceNotes || "Chưa có ghi chú nhật ký sửa chữa nào."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status selectors & Delete for admin & staffs */}
                {currentUser?.role !== 'Instructor' && (
                  <div className="pt-3 border-t border-slate-105 flex justify-between items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVehicleToDelete(v)}
                      className="bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 font-bold transition-all text-[11px] uppercase px-3 py-1.5 rounded-xl cursor-pointer border border-red-100 flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa xe
                    </button>
                    <select
                      value={v.status}
                      onChange={(e) => handleUpdateStatus(v.id, e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 text-xs py-1.5 px-2.5 rounded-xl font-bold cursor-pointer text-slate-700"
                    >
                      <option value="Đang hoạt động">✓ Hoạt động</option>
                      <option value="Đang bảo dưỡng">🔧 Bảo dưỡng</option>
                      <option value="Đang hỏng">❌ Hỏng hóc</option>
                    </select>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'expenses' && (() => {
        const allExpenses = vehicles.flatMap(v => 
          (v.expenses || []).map(e => ({
            ...e,
            vehicleId: v.id,
            vehicleName: v.name,
            vehiclePlate: v.plate,
            vehicleCode: v.code
          }))
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const filteredExpenses = allExpenses.filter(e => {
          const matchVeh = filterVehicleId === 'all' || e.vehicleId === filterVehicleId;
          const matchCat = filterCategory === 'all' || e.category === filterCategory;
          return matchVeh && matchCat;
        });

        const totalCost = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
        const gasolineCost = filteredExpenses.filter(e => e.category === 'Xăng xe').reduce((sum, e) => sum + e.amount, 0);
        const maintenanceCost = filteredExpenses.filter(e => e.category === 'Bảo dưỡng').reduce((sum, e) => sum + e.amount, 0);
        const registryCost = filteredExpenses.filter(e => e.category === 'Đăng kiểm').reduce((sum, e) => sum + e.amount, 0);
        const otherCost = filteredExpenses.filter(e => e.category === 'Chi phí khác').reduce((sum, e) => sum + e.amount, 0);

        const gasolinePct = totalCost > 0 ? (gasolineCost / totalCost) * 100 : 0;
        const maintenancePct = totalCost > 0 ? (maintenanceCost / totalCost) * 100 : 0;
        const registryPct = totalCost > 0 ? (registryCost / totalCost) * 105 : 0; // slight tweak to visually highlight if needed
        const otherPct = totalCost > 0 ? (otherCost / totalCost) * 100 : 0;

        return (
          <div className="space-y-5 animate-fade-in text-left">
            
            {/* Expense Cards Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-amber-50/70 border border-amber-100 p-5 rounded-3xl flex items-center justify-between shadow-3xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-amber-600 block uppercase font-extrabold tracking-wider">Xăng xe / Dầu máy</span>
                  <h4 className="text-lg font-black text-amber-900 font-mono">{gasolineCost.toLocaleString('vi-VN')} đ</h4>
                  <span className="text-[10px] text-amber-500 font-bold block">{filteredExpenses.filter(e => e.category === 'Xăng xe').length} phiếu phí ({gasolinePct.toFixed(0)}%)</span>
                </div>
                <div className="bg-amber-100 p-3 rounded-2xl">
                  <Fuel className="h-6 w-6 text-amber-600" />
                </div>
              </div>

              <div className="bg-blue-50/70 border border-blue-105 p-5 rounded-3xl flex items-center justify-between shadow-3xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-blue-600 block uppercase font-extrabold tracking-wider">Bảo dưỡng định kỳ</span>
                  <h4 className="text-lg font-black text-blue-900 font-mono">{maintenanceCost.toLocaleString('vi-VN')} đ</h4>
                  <span className="text-[10px] text-blue-500 font-bold block">{filteredExpenses.filter(e => e.category === 'Bảo dưỡng').length} phiếu phí ({maintenancePct.toFixed(0)}%)</span>
                </div>
                <div className="bg-blue-100 p-3 rounded-2xl">
                  <Wrench className="h-6 w-6 text-blue-600 text-slate-800" />
                </div>
              </div>

              <div className="bg-purple-50/70 border border-purple-100 p-5 rounded-3xl flex items-center justify-between shadow-3xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-purple-600 block uppercase font-extrabold tracking-wider">Phí Đăng kiểm xe</span>
                  <h4 className="text-lg font-black text-purple-900 font-mono">{registryCost.toLocaleString('vi-VN')} đ</h4>
                  <span className="text-[10px] text-purple-500 font-bold block">{filteredExpenses.filter(e => e.category === 'Đăng kiểm').length} phiếu phí ({totalCost > 0 ? ((registryCost / totalCost) * 100).toFixed(0) : 0}%)</span>
                </div>
                <div className="bg-purple-100 p-3 rounded-2xl">
                  <ClipboardList className="h-6 w-6 text-purple-600" />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-150 p-5 rounded-3xl flex items-center justify-between shadow-3xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-550 block uppercase font-extrabold tracking-wider">Chi phí khác phát sinh</span>
                  <h4 className="text-lg font-black text-slate-850 font-mono">{otherCost.toLocaleString('vi-VN')} đ</h4>
                  <span className="text-[10px] text-slate-500 font-bold block">{filteredExpenses.filter(e => e.category === 'Chi phí khác').length} phiếu phí ({otherPct.toFixed(0)}%)</span>
                </div>
                <div className="bg-slate-200/85 p-3 rounded-2xl">
                  <Coins className="h-6 w-6 text-slate-600" />
                </div>
              </div>
            </div>

            {/* Visual proportional bar graph */}
            <div className="bg-slate-50 border border-slate-120 rounded-3xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 border-b border-slate-200 pb-2.5">
                <h3 className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5"><Activity className="h-4 w-4 text-blue-600 animate-pulse" /> BIỂU ĐỒ DIỄN BIẾN TỶ TRỌNG SỬ DỤNG VỐN</h3>
                <span className="text-[11px] text-indigo-700 font-extrabold uppercase tracking-wider">TỔNG CỘNG HOẠT ĐỘNG: {totalCost.toLocaleString('vi-VN')} đ</span>
              </div>
              
              <div className="w-full bg-slate-200 h-4.5 rounded-full overflow-hidden flex shadow-inner">
                {gasolinePct > 0 && <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${gasolinePct}%` }} title={`Xăng xe: ${gasolinePct.toFixed(1)}%`} />}
                {maintenancePct > 0 && <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${maintenancePct}%` }} title={`Bảo dưỡng: ${maintenancePct.toFixed(1)}%`} />}
                {totalCost > 0 && registryCost > 0 && <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${(registryCost / totalCost) * 100}%` }} title={`Đăng kiểm: ${((registryCost / totalCost) * 100).toFixed(1)}%`} />}
                {otherPct > 0 && <div className="bg-slate-500 h-full transition-all duration-300" style={{ width: `${otherPct}%` }} title={`Khác: ${otherPct.toFixed(1)}%`} />}
              </div>

              {/* Legends and details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold pt-1">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 bg-amber-500 rounded-full shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase">⛽ Xăng xe</span>
                    <span className="text-slate-800 font-black">{gasolinePct.toFixed(1)}% <span className="font-semibold text-slate-500 text-[10.5px]">({gasolineCost.toLocaleString('vi-VN')} đ)</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 bg-blue-500 rounded-full shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase">🔧 Bảo dưỡng</span>
                    <span className="text-slate-800 font-black">{maintenancePct.toFixed(1)}% <span className="font-semibold text-slate-500 text-[10.5px]">({maintenanceCost.toLocaleString('vi-VN')} đ)</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 bg-purple-500 rounded-full shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase">📋 Đăng kiểm</span>
                    <span className="text-slate-800 font-black">{(totalCost > 0 ? (registryCost / totalCost) * 100 : 0).toFixed(1)}% <span className="font-semibold text-slate-500 text-[10.5px]">({registryCost.toLocaleString('vi-VN')} đ)</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 bg-slate-500 rounded-full shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase">💰 Chi phí khác</span>
                    <span className="text-slate-800 font-black">{otherPct.toFixed(1)}% <span className="font-semibold text-slate-500 text-[10.5px]">({otherCost.toLocaleString('vi-VN')} đ)</span></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter and table controls */}
            <div className="bg-white p-4.5 rounded-3xl border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-left">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase mb-1">Tìm chi phí theo xe</label>
                  <select
                    value={filterVehicleId}
                    onChange={(e) => setFilterVehicleId(e.target.value)}
                    className="bg-slate-50 border border-slate-200 py-2 px-3.5 rounded-xl cursor-pointer text-slate-750 font-black"
                  >
                    <option value="all">🚙 Tất cả xe tập ({vehicles.length})</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.name} [{v.plate}]</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 uppercase mb-1">Lọc theo nhóm chi phí</label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="bg-slate-50 border border-slate-200 py-2 px-3.5 rounded-xl cursor-pointer text-slate-755 font-black"
                  >
                    <option value="all">📂 Tất cả hạng mục</option>
                    <option value="Xăng xe">⛽ Xăng xe / Nhiên liệu</option>
                    <option value="Bảo dưỡng">🔧 Bảo dưỡng / Phụ tùng</option>
                    <option value="Đăng kiểm">📋 Đăng kiểm hành chính</option>
                    <option value="Chi phí khác">💰 Chi phí phát sinh khác</option>
                  </select>
                </div>
              </div>

              <div className="text-right text-slate-550 flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 border-slate-50 pt-2.5 md:pt-0">
                <span className="text-xs font-semibold text-slate-400 uppercase mt-0.5">Tổng số biên lai:</span>
                <span className="bg-blue-50 text-blue-700 text-xs px-3 py-1.5 rounded-xl font-black font-mono border border-blue-105">{filteredExpenses.length} phiếu thu chi</span>
              </div>
            </div>

            {/* Expenses Table Ledger */}
            <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-xs text-left">
              <div className="overflow-x-auto font-sans">
                <table className="w-full text-xs font-bold border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase text-slate-450 tracking-wider">
                      <th className="py-3.5 px-4.5 font-black text-left">Ngày chi</th>
                      <th className="py-3.5 px-4.5 font-black text-left">Xe tập lái</th>
                      <th className="py-3.5 px-4.5 font-black text-left">Hạng mục</th>
                      <th className="py-3.5 px-4.5 font-black text-left">Nội dung chi phí diễn giải</th>
                      <th className="py-3.5 px-4.5 font-black text-right">Số tiền hóa đơn</th>
                      {currentUser?.role !== 'Instructor' && <th className="py-3.5 px-4.5 font-black text-center">Tác vụ</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={currentUser?.role !== 'Instructor' ? 6 : 5} className="py-12 text-center text-slate-400 font-bold italic">
                          Chưa có hồ sơ chi phí nào khớp với bộ lọc tìm kiếm.
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((exp) => {
                        let badgeColor = '';
                        if (exp.category === 'Xăng xe') badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                        else if (exp.category === 'Bảo dưỡng') badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
                        else if (exp.category === 'Đăng kiểm') badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
                        else badgeColor = 'bg-slate-50 text-slate-700 border-slate-200';

                        return (
                          <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-4.5 text-slate-500 font-mono">
                              {exp.date.split('-').reverse().join('/')}
                            </td>
                            <td className="py-3.5 px-4.5">
                              <div className="flex flex-col">
                                <span className="text-slate-800 font-extrabold text-[12.5px]">{exp.vehicleName}</span>
                                <span className="text-[10px] text-slate-400 font-mono mt-0.5">{exp.vehiclePlate}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4.5">
                              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded border ${badgeColor}`}>
                                {exp.category}
                              </span>
                            </td>
                            <td className="py-3.5 px-4.5 text-slate-600 font-bold select-all leading-normal max-w-[280px] break-words">
                              {exp.notes || '-'}
                            </td>
                            <td className="py-3.5 px-4.5 text-right font-black text-slate-850 font-mono text-xs">
                              {exp.amount.toLocaleString('vi-VN')} ₫
                            </td>
                            {currentUser?.role !== 'Instructor' && (
                              <td className="py-3.5 px-4.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExpense(exp.vehicleId, exp.id, exp.amount, exp.category)}
                                  className="p-1 px-3 bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-800 rounded-xl border border-red-100 hover:border-red-300 cursor-pointer transition-colors text-[10.5px] font-black"
                                >
                                  <Trash2 className="h-3.5 w-3.5 inline mr-0.5" /> Gỡ
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        );
      })()}

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-zoom-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <span className="text-sm font-black text-slate-800 uppercase flex items-center gap-1.5 animate-pulse">
                <Car className="h-5 w-5 text-blue-600" /> THÊM XE TẬP LÁI MỚI
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
                <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Tên dòng xe & Model *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Toyota Vios 2024"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Biển kiểm soát (BKS) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 29A-123.45"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-550 uppercase mb-1.5">Cơ cấu hộp số</label>
                  <select
                    value={transmission}
                    onChange={(e) => setTransmission(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-800 text-xs font-bold"
                  >
                    <option value="Số tự động">Số tự động (AT)</option>
                    <option value="Số sàn">Số sàn (MT)</option>
                    <option value="Khác">Phần Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-550 uppercase mb-1.5">Dạy phù hợp Hạng</label>
                  <select
                    value={licenseClass}
                    onChange={(e) => setLicenseClass(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-805 text-xs"
                  >
                    <option value="A1">Hạng bằng A1</option>
                    <option value="A">Hạng bằng A</option>
                    <option value="B số tự động">Hạng bằng B Tự Động</option>
                    <option value="B số sàn">Hạng bằng B Số Sàn</option>
                    <option value="C1">Hạng bằng C1 (Xe Tải)</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3.5 space-y-3.5 text-left text-xs text-slate-700">
                <span className="text-[10px] font-black text-blue-600 block uppercase tracking-wider">🔧 THÔNG SỐ BẢO DƯỠNG ĐẦU VÀO (TÙY CHỌN)</span>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5 font-bold">Số Km hiện tại</label>
                    <input
                      type="number"
                      placeholder="e.g. 10000"
                      value={initMileage}
                      onChange={(e) => setInitMileage(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-800 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5 font-bold">Mốc thay dầu kế</label>
                    <input
                      type="number"
                      placeholder="e.g. 15000"
                      value={initNextOilChangeMileage}
                      onChange={(e) => setInitNextOilChangeMileage(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-800 text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5 font-bold">Ngày thay dầu kế tiếp</label>
                    <input
                      type="date"
                      value={initNextOilChangeDate}
                      onChange={(e) => setInitNextOilChangeDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-805 text-xs text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase mb-1.5 font-bold">Lần bảo dưỡng gần nhất</label>
                    <input
                      type="date"
                      value={initLastMaintenanceDate}
                      onChange={(e) => setInitLastMaintenanceDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-slate-805 text-xs text-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5 font-bold">Ghi chú trạng thái / Nhật ký bảo dưỡng</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Đã kiểm tra phanh phụ cơ khí, thay dầu thô tại 5,000 km..."
                    value={initMaintenanceNotes}
                    onChange={(e) => setInitMaintenanceNotes(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
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
                  ✓ ĐĂNG KÍ XE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPDATE MAINTENANCE DIALOG */}
      {editingVehicle && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-zoom-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 text-left">
              <span className="text-sm font-black text-slate-800 uppercase flex items-center gap-1.5 leading-none">
                <Wrench className="h-5 w-5 text-blue-600 animate-pulse" /> CẬP NHẬT THÔNG SỐ BẢO DƯỠNG
              </span>
              <button
                type="button"
                onClick={() => setEditingVehicle(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            <div className="p-4 bg-slate-800 text-slate-100 text-left">
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">Đang hiệu chỉnh xe tập:</p>
              <h4 className="text-sm font-black tracking-tight">{editingVehicle.name}</h4>
              <p className="text-[10px] text-slate-300 font-mono mt-0.5">Biển kiểm soát: {editingVehicle.plate} • Mã: {editingVehicle.code || editingVehicle.id}</p>
            </div>

            <form onSubmit={handleSaveMaintenance} className="p-5 space-y-4 text-xs font-bold text-left">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-505 uppercase mb-1.5 font-black">Số Km hiện tại *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 12500"
                    value={editCurrentMileage}
                    onChange={(e) => setEditCurrentMileage(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-505 uppercase mb-1.5 font-black">Mốc thay dầu kế *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 15000"
                    value={editNextOilChangeMileage}
                    onChange={(e) => setEditNextOilChangeMileage(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-505 uppercase mb-1.5 font-black">Hạn thay dầu tiếp theo</label>
                  <input
                    type="date"
                    value={editNextOilChangeDate}
                    onChange={(e) => setEditNextOilChangeDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-705 font-bold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-505 uppercase mb-1.5 font-black">Ngày bảo dưỡng gần nhất</label>
                  <input
                    type="date"
                    value={editLastMaintenanceDate}
                    onChange={(e) => setEditLastMaintenanceDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-705 font-bold text-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-505 uppercase mb-1.5 font-black">Ghi chú chi tiết bảo dưỡng xe / Nhật ký thay dầu</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Nhập lịch sử chi tiết sửa chữa, loại dầu nhớt đã thay, hỏng hóc phát sinh..."
                  value={editMaintenanceNotes}
                  onChange={(e) => setEditMaintenanceNotes(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setEditingVehicle(null)}
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  ĐÓNG
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all uppercase font-black"
                >
                  <CheckCircle className="h-4.5 w-4.5" />
                  <span>Xác nhận Lưu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation modal for deleting vehicle */}
      {vehicleToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl overflow-hidden animate-zoom-in text-left">
            <div className="p-5 border-b border-slate-100 bg-red-50 text-red-800">
              <span className="text-sm font-black uppercase flex items-center gap-1.5 font-sans leading-none">
                <AlertTriangle className="h-5 w-5 text-red-600 animate-bounce" /> XÓA XE KHỎI HỆ THỐNG
              </span>
            </div>
            <div className="p-5 space-y-3 font-semibold text-xs text-slate-600 leading-normal font-sans">
              <p>Thầy đang yêu cầu xóa vĩnh viễn xe tập lái:</p>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-105">
                <h4 className="font-extrabold text-slate-800 text-sm uppercase">{vehicleToDelete.name}</h4>
                <p className="font-mono text-slate-400 mt-1">Biển số: {vehicleToDelete.plate}</p>
              </div>
              <p className="text-red-000 font-bold text-red-600">⚠️ Cảnh báo: Việc xóa xe sẽ loại bỏ phương tiện hoàn toàn khỏi sổ cái. Thầy có chắc chắn muốn tiếp tục?</p>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end text-xs font-bold leading-none font-sans">
              <button
                type="button"
                onClick={() => setVehicleToDelete(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl cursor-pointer animate-pulse"
              >
                HỦY
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteVehicle(vehicleToDelete.id);
                  setVehicleToDelete(null);
                  alert(`Đã xóa xe ${vehicleToDelete.name} thành công.`);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl cursor-pointer shadow-sm font-black uppercase"
              >
                XÁC NHẬN XÓA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal for deleting an expense */}
      {expenseToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl overflow-hidden animate-zoom-in text-left">
            <div className="p-5 border-b border-slate-100 bg-red-50 text-red-800">
              <span className="text-sm font-black uppercase flex items-center gap-1.5 font-sans leading-none">
                <AlertTriangle className="h-5 w-5 text-red-600 animate-bounce" /> XÓA CHI PHÍ XE
              </span>
            </div>
            <div className="p-5 space-y-3 font-semibold text-xs text-slate-600 leading-normal font-sans">
              <p>Thầy đang yêu cầu xóa mục chi phí hoạt động xe:</p>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-105">
                <h4 className="font-extrabold text-slate-800 text-sm uppercase">{expenseToDelete.vehicleName}</h4>
                <p className="text-slate-500 mt-1">Loại chi phí: <strong className="text-slate-700">{expenseToDelete.category}</strong></p>
                <p className="font-mono text-slate-400 mt-0.5">Số tiền: <strong className="text-red-650">{expenseToDelete.amount.toLocaleString('vi-VN')} ₫</strong></p>
              </div>
              <p className="text-red-000 font-bold text-red-600">⚠️ Thao tác này sẽ xóa vĩnh viễn phiếu chi này khỏi sổ sách của xe và không thể khôi phục lại.</p>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end text-xs font-bold leading-none font-sans">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl cursor-pointer"
              >
                HỦY
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { vehicleId, expenseId, amount, category, vehicleName } = expenseToDelete;
                  const parentVeh = vehicles.find(v => v.id === vehicleId);
                  if (parentVeh) {
                    const remainingExp = (parentVeh.expenses || []).filter(e => e.id !== expenseId);
                    updateVehicle(vehicleId, { expenses: remainingExp });
                    await addAuditLog('Xóa chi phí xe', `Xóa hóa đơn chi phí ${category} của xe ${vehicleName} số tiền: -${amount.toLocaleString('vi-VN')} đ.`);
                    alert('Đã gỡ phiếu thu chi khỏi hồ sơ xe tập.');
                  }
                  setExpenseToDelete(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl cursor-pointer shadow-sm font-black uppercase"
              >
                XÁC NHẬN XÓA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Record dialog/form */}
      {isAddingExpense && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-zoom-in text-left">
            <div className="p-5 border-b border-slate-100 bg-indigo-50 text-indigo-900 flex justify-between items-center font-sans">
              <span className="text-sm font-black uppercase flex items-center gap-1.5 leading-none">
                <Coins className="h-5 w-5 text-indigo-600" /> KÊ KHAI CHI PHÍ HOẠT ĐỘNG XE
              </span>
              <button
                onClick={() => setIsAddingExpense(false)}
                className="text-slate-400 hover:text-slate-655 cursor-pointer"
              >
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            <form onSubmit={handleSubmitExpense} className="p-5 space-y-4 text-xs font-bold font-sans">
              <div>
                <label className="block text-[10px] text-slate-550 uppercase mb-1.5 font-black">Chọn xe tập lái kê chi phí *</label>
                <select
                  value={expenseVehicleId}
                  onChange={(e) => setExpenseVehicleId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 text-xs font-bold"
                >
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.name} [{v.plate}]</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-550 uppercase mb-1.5 font-black">Hạng mục chi phí *</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 text-xs font-bold"
                  >
                    <option value="Xăng xe">⛽ Xăng xe / Nhiên liệu</option>
                    <option value="Bảo dưỡng">🔧 Bảo dưỡng / Sửa chữa</option>
                    <option value="Đăng kiểm">📋 Phí kiểm định xe</option>
                    <option value="Chi phí khác">💰 Chi phí hành chính khác</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-550 uppercase mb-1.5 font-black">Số tiền chi trả (VND) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="e.g. 500000"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-550 uppercase mb-1.5 font-black">Ngày chi trả hóa đơn *</label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-705 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-555 uppercase mb-1.5 font-black font-extrabold text-left">Ghi chú chi tiết / Mô tả chi phí *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Đổ 30 lít xăng RON 95 tại cây xăng Petrolimex..."
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold leading-relaxed text-slate-800"
                />
              </div>

              <div className="pt-3.5 border-t border-slate-100 flex gap-2 justify-end text-xs font-bold font-sans">
                <button
                  type="button"
                  onClick={() => setIsAddingExpense(false)}
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl cursor-pointer shadow-sm font-black uppercase text-xs"
                >
                  ✓ LƯU PHIẾU CHI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
