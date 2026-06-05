/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { getLocalTodayString, getLocalOffsetString } from '../utils/dateUtils';
import { Download, Calendar, FileSpreadsheet, TrendingUp, Layers, Users, Star, Fuel, Wrench, BarChart2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export const Reports: React.FC = () => {
  const { students, payments, lessons, vehicles } = useDatabase();

  const [startDate, setStartDate] = useState(getLocalOffsetString(-30));
  const [endDate, setEndDate] = useState(getLocalTodayString());

  // Filter students based on registration date
  const filteredStudentsForReport = students.filter(
    s => s.registrationDate >= startDate && s.registrationDate <= endDate
  );

  // Filter payments
  const filteredPayments = payments.filter(
    p => !p.isCancelled && p.paymentDate >= startDate && p.paymentDate <= endDate
  );

  const totalExpectedReport = filteredStudentsForReport.reduce((sum, s) => sum + s.totalFee, 0);
  const totalCollectedReport = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalDebtReport = filteredStudentsForReport.reduce((sum, s) => sum + s.remainingAmount, 0);

  // Export to CSV Function
  const handleExportCSV = () => {
    if (filteredStudentsForReport.length === 0) {
      alert('Không có dữ liệu học viên trong khoảng thời gian này để xuất báo cáo.');
      return;
    }

    // CSV Headers
    const headers = [
      'Mã học viên',
      'Họ và tên',
      'Số điện thoại',
      'Hạng bằng đăng lý',
      'Chương trình học',
      'Ngày đăng ký',
      'Tổng học phí (VND)',
      'Đã đóng (VND)',
      'Còn nợ (VND)',
      'Tiến độ học (Buổi)'
    ];

    // CSV Rows mapping
    const rows = filteredStudentsForReport.map(s => [
      s.code,
      `"${s.name.replace(/"/g, '""')}"`,
      s.phone,
      s.licenseClass,
      `"${s.courseType}"`,
      s.registrationDate,
      s.totalFee,
      s.paidAmount,
      s.remainingAmount,
      `"${s.completedSessions}/${s.totalSessions}"`
    ]);

    // Build complete string
    const csvContent =
      '\ufeff' + // Add UTF-8 BOM representation for correct Vietnamese character displaying in Excel !
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    // Create browser download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `BC_Hoc_Vien_LichHocPro_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter vehicle expenses within selected dates
  const filteredExpensesForReport = (vehicles || []).flatMap(v => 
    (v.expenses || []).map(e => ({
      ...e,
      vehicleName: v.name,
      vehiclePlate: v.plate
    }))
  ).filter(e => e.date >= startDate && e.date <= endDate);

  const categoryTotals = filteredExpensesForReport.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const totalExpenseAmount = filteredExpensesForReport.reduce((sum, e) => sum + e.amount, 0);

  const fuelCost = categoryTotals['Xăng xe'] || 0;
  const maintCost = categoryTotals['Bảo dưỡng'] || 0;
  const regCost = categoryTotals['Đăng kiểm'] || 0;
  const otherCost = categoryTotals['Chi phí khác'] || 0;

  const chartData = [
    { name: 'Xăng xe / Dầu máy', value: fuelCost, color: '#F59E0B' },
    { name: 'Bảo dưỡng / Phụ tùng', value: maintCost, color: '#3B82F6' },
    { name: 'Phí đăng kiểm hành chính', value: regCost, color: '#8B5CF6' },
    { name: 'Chi phí phát sinh khác', value: otherCost, color: '#64748B' },
  ].filter(item => item.value > 0);

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percent > 0.05 ? (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="font-sans font-black text-[10px]">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  return (
    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-6">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">BÁO CÁO HOẠT ĐỘNG</h1>
          <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
            Phân tích số liệu đăng ký, kết suất chứng từ Excel / CSV chuẩn kế toán
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white px-4 py-3.5 rounded-2xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all self-start sm:self-auto uppercase"
        >
          <FileSpreadsheet className="h-4.5 w-4.5" />
          KẾT XUẤT CSV HỌC VIÊN
        </button>
      </div>

      {/* Date Range block */}
      <div className="bg-white p-4 border border-slate-100 shadow-sm rounded-3xl space-y-4">
        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Chọn biên giới hạn xuất báo cáo</span>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-3 text-xs font-bold font-mono text-slate-700">
            <span className="w-24 shrink-0 font-sans font-bold text-slate-500 uppercase tracking-wide">Từ ngày</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border-0 font-bold ml-2 text-slate-755 focus:outline-none w-full"
            />
          </div>

          <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-3 text-xs font-bold font-mono text-slate-700">
            <span className="w-24 shrink-0 font-sans font-bold text-slate-500 uppercase tracking-wide">Đến ngày</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border-0 font-bold ml-2 text-slate-755 focus:outline-none w-full"
            />
          </div>
        </div>
      </div>

      {/* KPI statistics in the selected dates */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 border border-slate-100 rounded-3xl text-xs font-bold">
          <span className="text-slate-400 uppercase tracking-wider text-[9px] font-black block mb-2">Hồ sơ mới thu nộp</span>
          <span className="text-xl font-black text-slate-800">{filteredStudentsForReport.length} học viên</span>
        </div>

        <div className="bg-white p-4 border border-slate-100 rounded-3xl text-xs font-bold">
          <span className="text-slate-400 uppercase tracking-wider text-[9px] font-black block mb-2">Dự thu khóa học mới</span>
          <span className="text-xl font-mono font-black text-slate-800">{totalExpectedReport.toLocaleString('vi-VN')} ₫</span>
        </div>

        <div className="bg-white p-4 border border-slate-100 rounded-3xl text-xs font-bold">
          <span className="text-slate-400 uppercase tracking-wider text-[9px] font-black block mb-2">Số tiền huy động nộp</span>
          <span className="text-xl font-mono font-black text-emerald-600">{totalCollectedReport.toLocaleString('vi-VN')} ₫</span>
        </div>

        <div className="bg-white p-4 border border-slate-100 rounded-3xl text-xs font-bold">
          <span className="text-slate-400 uppercase tracking-wider text-[9px] font-black block mb-2">Công nợ đọng sinh thêm</span>
          <span className="text-xl font-mono font-black text-red-600">{totalDebtReport.toLocaleString('vi-VN')} ₫</span>
        </div>

      </div>

      {/* Dynamic charts reporting container */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COMPONENT: EXPENSES DIVISION CHART */}
        <div className="bg-white border border-slate-100 p-5 rounded-3xl space-y-4 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex justify-between items-center pb-2.5 border-b border-dashed border-slate-100">
              <span className="text-xs font-black text-slate-800 uppercase flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" /> Tỉ trọng chi phí hoạt động xe tập
              </span>
              <span className="bg-orange-50 text-orange-700 text-[10px] px-2.5 py-1 rounded-xl font-black">
                Tổng: {totalExpenseAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed font-bold mt-3">
              Biểu đồ tỉ lệ phân bố giữa Xăng xe/Nhiên liệu và Bảo dưỡng sửa chữa xe tập lái:
            </p>
          </div>

          <div className="h-60 w-full flex items-center justify-center relative">
            {chartData.length === 0 ? (
              <div className="text-center space-y-2 mt-4">
                <span className="text-3xl block">⛽</span>
                <p className="text-xs text-slate-400 italic font-bold">Chưa phát sinh hay nộp chứng từ chi phí nào trong khoảng tuyển chọn này.</p>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase">Vào mục Quản lý Xe & Chi phí để ghi hoá đơn chi mới</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={75}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [`${Number(value).toLocaleString('vi-VN')} ₫`, 'Chi phí']}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderRadius: '16px',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconSize={10}
                    formatter={(value) => <span className="text-[10.5px] font-black text-slate-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {totalExpenseAmount > 0 && (
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-[11px] font-bold text-slate-600 leading-normal space-y-1 mt-1">
              <div className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold flex items-center gap-1">
                ⚡ Đánh giá tỉ trọng cốt lõi:
              </div>
              <p>
                {fuelCost > 0 || maintCost > 0 ? (
                  <>
                    Hao phí xăng xe chiếm <strong className="text-amber-600 font-black">{((fuelCost / totalExpenseAmount) * 100).toFixed(0)}%</strong> ({fuelCost.toLocaleString('vi-VN')} đ) so với bảo dưỡng xe tập là <strong className="text-blue-600 font-black">{((maintCost / totalExpenseAmount) * 100).toFixed(0)}%</strong> ({maintCost.toLocaleString('vi-VN')} đ).
                    {fuelCost > 0 && maintCost > 0 && (
                      <span className="block mt-1 font-extrabold text-indigo-700">
                        {fuelCost > maintCost 
                          ? `👉 Chi phí xăng xe cao gấp ${(fuelCost / maintCost).toFixed(1)} lần chi phí bảo dưỡng định kỳ.`
                          : `👉 Chi phí bảo dưỡng cao gấp ${(maintCost / fuelCost).toFixed(1)} lần tiền đổ xăng dầu.`
                        }
                      </span>
                    )}
                  </>
                ) : (
                  'Chưa có dữ liệu so sánh xăng xe & bảo dưỡng.'
                )}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COMPONENT: Training completed KPI status */}
        <div className="bg-white border border-slate-100 p-5 rounded-3xl space-y-4 flex flex-col justify-between shadow-xs">
          <div>
            <div className="pb-2.5 border-b border-dashed border-slate-100">
              <span className="text-xs font-black text-slate-800 uppercase flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-500" /> Thống kê đào tạo (Tỉ lệ đạt chỉ tiêu Km)
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-bold mt-3">
              Báo cáo thống kê hiệu suất hoàn thành 810km đường trường đào tạo của học viên theo DAT khóa tháng mẫu:
            </p>
          </div>

          {/* Dynamic bar charts */}
          <div className="space-y-4 my-auto py-2">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
              <div className="flex justify-between font-extrabold text-[11px]">
                <span className="text-slate-700">Tập sa hình cốt lõi (Đạt yêu cầu)</span>
                <span className="text-blue-700 font-black">85% học viên</span>
              </div>
              <div className="relative h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div className="absolute left-0 top-0 h-full bg-blue-600 rounded-full w-[85%]"></div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
              <div className="flex justify-between font-extrabold text-[11px]">
                <span className="text-slate-700">Tỉ lệ thi thử lý thuyết đạt điểm đỗ</span>
                <span className="text-emerald-700 font-black">92% học viên</span>
              </div>
              <div className="relative h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full w-[92%]"></div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-2xl text-[11px] text-blue-700 font-bold leading-relaxed mt-1">
            📌 Thầy cô chú ý đôn đốc lịch học DAT đường trường cho các học viên đạt dưới 100km để kịp tiến độ nộp hồ sơ thi sát hạch cuối tháng.
          </div>
        </div>

      </div>

    </div>
  );
};
