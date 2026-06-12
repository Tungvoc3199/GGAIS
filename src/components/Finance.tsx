/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Payment, Student } from '../types';
import {
  TrendingUp,
  DollarSign,
  AlertOctagon,
  Calendar,
  Layers,
  Activity,
  FileSpreadsheet,
  X,
  CreditCard,
  User,
  Clock,
  Trash2,
  AlertTriangle,
  Receipt
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

export const Finance: React.FC = () => {
  const {
    currentUser,
    students,
    payments,
    cancelPayment,
    addPayment,
    approvePayment
  } = useDatabase();

  const [activeTab, setActiveTab] = useState<'kpi' | 'ledger' | 'outstanding' | 'approve'>('ledger');

  // Cancel transaction modal tracking
  const [cancellingPayId, setCancellingPayId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null);

  const isApprovedActivePayment = (p: Payment) =>
    p.status === 'Đã duyệt' && p.isCancelled === false;

  // 1. Calculate general financial metrics (excluding pending approvals)
  const totalExpected = students.reduce((sum, s) => sum + s.totalFee, 0);
  const totalCollected = payments.filter(isApprovedActivePayment).reduce((sum, p) => sum + p.amount, 0);

  const computedDebt = Math.max(0, totalExpected - totalCollected);
  const cachedDebt = students.reduce((sum, s) => sum + s.remainingAmount, 0);
  const hasDebtMismatch = cachedDebt !== computedDebt;

  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const TODAY = getTodayString();

  // Today Revenue
  const todayRevenue = payments
    .filter(p => isApprovedActivePayment(p) && p.paymentDate === TODAY)
    .reduce((sum, p) => sum + p.amount, 0);

  // This Week (Last 7 days)
  const getNDaysAgoString = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const sevenDaysAgo = getNDaysAgoString(7);

  const weekRevenue = payments
    .filter(p => isApprovedActivePayment(p) && p.paymentDate >= sevenDaysAgo && p.paymentDate <= TODAY)
    .reduce((sum, p) => sum + p.amount, 0);

  // This Month
  const currentMonthStr = TODAY.substring(0, 7);
  const monthRevenue = payments
    .filter(p => isApprovedActivePayment(p) && p.paymentDate.startsWith(currentMonthStr))
    .reduce((sum, p) => sum + p.amount, 0);

  // Overdue students list (with remaining debt and deadline past TODAY)
  const debtors = students.filter(s => s.remainingAmount > 0 && s.nextPaymentDeadline < TODAY);

  // Breakdown by course types
  const courseSummaryData = students.reduce((acc: { [key: string]: number }, s) => {
    acc[s.courseType] = (acc[s.courseType] || 0) + s.totalFee;
    return acc;
  }, {});

  // Generate the last 6 months dynamically based on TODAY's date to ensure continuous representation
  const getMonthlyTrendData = () => {
    const approvedPayments = payments.filter(isApprovedActivePayment);
    
    // Create map of existing payments
    const monthlyMap: { [key: string]: number } = {};
    approvedPayments.forEach(p => {
      if (p.paymentDate) {
        const monthKey = p.paymentDate.substring(0, 7); // "YYYY-MM"
        monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + p.amount;
      }
    });

    // Generate last 6 months chronologically leading to TODAY's month
    const trendData = [];
    
    // We parse TODAY's year and month
    const parts = TODAY.split('-');
    const currentYear = parseInt(parts[0], 10);
    const currentMonth = parseInt(parts[1], 10) - 1; // 0-indexed
    
    for (let i = 5; i >= 0; i--) {
      // Find the date for the month "i" months ago
      const d = new Date(currentYear, currentMonth - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${month}`;
      
      const revenue = monthlyMap[monthKey] || 0;
      
      trendData.push({
        rawMonth: monthKey,
        monthLabel: `Tháng ${month}/${year}`,
        monthShort: `T${month}/${String(year).substring(2)}`,
        "Doanh thu": revenue,
      });
    }
    
    return trendData;
  };

  const monthlyTrendData = getMonthlyTrendData();

  const formatYAxis = (value: number) => {
    if (value === 0) return '0 ₫';
    if (value >= 1000000) return `${(value / 1000000).toFixed(0)} Tr`;
    return `${value.toLocaleString('vi-VN')} ₫`;
  };

  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 shadow-xl font-sans text-xs space-y-1">
          <p className="font-extrabold text-slate-450 uppercase tracking-widest text-[9px]">{payload[0].payload.monthLabel}</p>
          <p className="font-mono font-black text-emerald-400 text-sm">
            {payload[0].value.toLocaleString('vi-VN')} ₫
          </p>
        </div>
      );
    }
    return null;
  };

  const handleTriggerCancel = (payId: string) => {
    if (currentUser?.role === 'Staff') {
      alert('Tài khoản tuyển sinh (Staff) không được phép can thiệp ghi nhận lại tài chính.');
      return;
    }
    setCancellingPayId(payId);
    setCancelReason('');
  };

  const handleConfirmCancel = async () => {
    if (!cancellingPayId || !cancelReason.trim() || isCancellingPayment) return;
    try {
      setIsCancellingPayment(true);
      await cancelPayment(cancellingPayId, cancelReason.trim());
      setCancellingPayId(null);
      setCancelReason("");
      alert("Đã hủy phiếu thành công. Doanh thu và công nợ đã được cập nhật.");
    } catch (error: any) {
      alert(`Hủy phiếu thất bại: ${error?.message || String(error)}`);
    } finally {
      setIsCancellingPayment(false);
    }
  };

  const pendingCount = payments.filter(p => !p.isCancelled && p.status === 'Chờ duyệt').length;

  return (
    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-5">
      
      {/* Header section */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">DOANH THU & CÔNG NỢ</h1>
        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
          Theo dõi dòng tiền thu học phí, kiểm soát hoàn thu và danh sách học nợ quá hạn
        </p>
      </div>

      {/* Main financial cards overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* TotalExpected card */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">Dự thu Toàn Trường</span>
            <div className="text-xl font-mono font-black text-slate-800">{totalExpected.toLocaleString('vi-VN')} ₫</div>
            <p className="text-[10px] text-slate-400 font-medium">Toàn hệ thống đóng hồ sơ 12 học viên mẫu</p>
          </div>
        </div>

        {/* TotalCollected card */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">Doanh thu Đã Thu (100%)</span>
            <div className="text-xl font-mono font-black text-emerald-600">{totalCollected.toLocaleString('vi-VN')} ₫</div>
            <span className="text-[10px] text-emerald-500 font-bold">Thực nộp lên kho: {((totalCollected / totalExpected) * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* TotalDebt card */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-red-50 text-red-600">
            <AlertOctagon className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">Dư nợ Phải Thu (Cần thu)</span>
            <div className="text-xl font-mono font-black text-red-600">{computedDebt.toLocaleString('vi-VN')} ₫</div>
            <span className="text-[10px] text-red-500 font-bold block">Chiếm {(100 - (totalCollected / totalExpected) * 100).toFixed(1)}% tổng giá trị hồ sơ</span>
            {hasDebtMismatch && (
              <span className="text-[10px] text-amber-600 font-bold block mt-1 leading-normal bg-amber-50 px-2 py-1 rounded border border-amber-100">
                ⚠ Dữ liệu công nợ học viên cần đối soát lại
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Dynamic revenue windows summary panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-white border border-slate-100 rounded-2xl shadow-xs text-xs">
          <span className="text-slate-400 block font-semibold">Doanh thu Hôm nay ({(() => {
            const parts = TODAY.split('-');
            return `${parts[2]}/${parts[1]}`;
          })()})</span>
          <strong className="text-sm text-slate-800 font-mono font-black block mt-0.5">{todayRevenue.toLocaleString('vi-VN')} ₫</strong>
        </div>

        <div className="p-3 bg-white border border-slate-100 rounded-2xl shadow-xs text-xs">
          <span className="text-slate-400 block font-semibold">Doanh thu Tuần này (7 ngày gần nhất)</span>
          <strong className="text-sm text-slate-800 font-mono font-black block mt-0.5">{weekRevenue.toLocaleString('vi-VN')} ₫</strong>
        </div>

        <div className="p-3 bg-white border border-slate-100 rounded-2xl shadow-xs text-xs">
          <span className="text-slate-400 block font-semibold">Doanh thu Tháng này ({(() => {
            const parts = TODAY.split('-');
            return `Tháng ${parts[1]}/${parts[0]}`;
          })()})</span>
          <strong className="text-sm text-slate-800 font-mono font-black block mt-0.5">{monthRevenue.toLocaleString('vi-VN')} ₫</strong>
        </div>
      </div>

      {/* Recharts Revenue Trend Chart */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Xu hướng doanh thu 6 tháng gần nhất</h3>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Biểu đồ trực quan hóa dữ liệu thực thu đã phê duyệt</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
            <span className="h-2 w-2 rounded-full bg-blue-600"></span>
            <span>Doanh thu thực tế (Tr = Triệu đồng)</span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={monthlyTrendData}
              margin={{ top: 10, right: 15, left: -20, bottom: 5 }}
            >
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.01}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="monthShort"
                stroke="#94a3b8"
                fontSize={10}
                fontWeight={700}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={10}
                fontWeight={700}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxis}
              />
              <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="Doanh thu"
                stroke="#2563eb"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorRevenue)"
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2, fill: '#2563eb' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="border-b border-slate-100 flex flex-wrap gap-2 font-bold text-xs text-slate-500 shrink-0 bg-white p-1 rounded-2xl w-full">
        {[
          { id: 'ledger', label: 'Hóa Đơn / Nhật Ký Phiếu Thu' },
          { id: 'approve', label: `Duyệt Học Phí Chờ Xác Nhận (${pendingCount})` },
          { id: 'outstanding', label: 'Danh Sách Học Viên Nợ Đọng' },
          { id: 'kpi', label: 'Phân tích Khóa Học' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`py-2 px-3.5 rounded-xl border transition-all cursor-pointer ${activeTab === t.id ? 'border-blue-600 bg-blue-50/20 text-blue-600 font-black shadow-xs' : 'border-transparent hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TABS CONTENT */}

      {/* TAB ledger: COMPLETE DATABASE LOGS OF PAYMENTS */}
      {activeTab === 'ledger' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <span className="text-xs font-black text-slate-800 block uppercase">Nhật ký hóa đơn của trường lái</span>
            <span className="text-[10px] text-slate-400 font-semibold">Dấu thời gian khóa thực tế</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-bold border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-widest bg-slate-50/50">
                  <th className="py-3 px-4">Mã Giao dịch</th>
                  <th className="py-3 px-4">Học viên</th>
                  <th className="py-3 px-4">Ngày nộp</th>
                  <th className="py-3 px-4">Số tiền</th>
                  <th className="py-3 px-4">Hạng mục thu</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Cán bộ lập phiếu</th>
                  <th className="py-3 px-4">Thao tác hủy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700">
                {payments
                   .sort((a,b)=> b.createdAt.localeCompare(a.createdAt))
                  .map((p) => {
                    const student = students.find(s => s.id === p.studentId);
                    
                    // Determine state
                    let statusBadge = null;
                    if (p.isCancelled) {
                      statusBadge = (
                        <span className="text-[10px] text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md font-bold">
                          Đã hủy
                        </span>
                      );
                    } else if (p.status === 'Đã duyệt') {
                      statusBadge = (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md font-bold">
                          ✓ Đã duyệt
                        </span>
                      );
                    } else {
                      statusBadge = (
                        <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md font-bold">
                          ⏳ Chờ duyệt
                        </span>
                      );
                    }

                    return (
                      <tr key={p.id} className={p.isCancelled ? 'bg-slate-50/50 opacity-60' : 'hover:bg-slate-50/30'}>
                        <td className="py-3 px-4 font-mono text-[10px] text-slate-450">{p.id}</td>
                        <td className="py-3 px-4">
                          <div className={p.isCancelled ? 'line-through text-slate-400' : 'text-slate-800 font-bold uppercase'}>
                            {student?.name || 'Học viên'}
                          </div>
                          <span className="text-[9px] text-slate-400 font-medium">{p.method}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-medium">
                          {new Date(p.paymentDate).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-mono ${p.isCancelled ? 'text-slate-400 line-through' : 'text-emerald-600 font-black'}`}>
                            {p.amount.toLocaleString('vi-VN')} ₫
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-655">{p.category}</td>
                        <td className="py-3 px-4">{statusBadge}</td>
                        <td className="py-3 px-4 font-semibold text-slate-500">{p.receiver}</td>
                        <td className="py-3 px-4 text-center">
                          {!p.isCancelled && (currentUser?.role === 'Admin' || currentUser?.role === 'Accountant') && (
                            <button
                              onClick={() => handleTriggerCancel(p.id)}
                              className="text-[10px] text-red-600 hover:bg-red-50 hover:border-red-200 border border-transparent px-2 py-1 rounded-md transition-all cursor-pointer"
                            >
                              Hủy phiếu
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB approve: PENDING PAYMENTS FOR REVIEW */}
      {activeTab === 'approve' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <div>
              <span className="text-xs font-black text-slate-800 block uppercase">Phê duyệt học phí chờ đối soát (Xác nhận học phí)</span>
              <p className="text-[10px] text-slate-400 font-normal">Các giao dịch đóng tiền mới từ học viên cần Thầy/Cô duyệt để kích hoạt doanh thu và trừ nợ học vụ</p>
            </div>
            <span className="text-xs font-extrabold text-blue-650 bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
              Chờ phê duyệt: {payments.filter(p => !p.isCancelled && p.status === 'Chờ duyệt').length} phiếu
            </span>
          </div>

          {payments.filter(p => !p.isCancelled && p.status === 'Chờ duyệt').length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 italic">
              Hiện tại không có khoản đóng học phí nào đang chờ duyệt. Mọi số liệu dốc sổ đã hoàn tất!
            </div>
          ) : (
            <div className="space-y-3 text-left">
              {payments
                .filter(p => !p.isCancelled && p.status === 'Chờ duyệt')
                .map((p) => {
                  const student = students.find(s => s.id === p.studentId);
                  return (
                    <div key={p.id} className="p-4 bg-slate-50 border border-slate-150 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-xs transition-all">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-900 font-extrabold uppercase text-sm">{student?.name || 'Học viên'}</span>
                          <span className="bg-amber-100 text-amber-700 font-bold text-[9px] px-1.5 py-0.5 rounded-md uppercase">
                            Chờ duyệt
                          </span>
                        </div>
                        <p className="text-slate-500 font-semibold">
                          Khóa: <span className="text-slate-700">{student?.courseType}</span> • SĐT: <span className="text-slate-700">{student?.phone || 'N/A'}</span>
                        </p>
                        <p className="text-slate-500 font-semibold">
                          Người nộp: <span className="text-slate-700">{p.receiver}</span> • Ngày đóng: <span className="text-slate-700">{new Date(p.paymentDate).toLocaleDateString('vi-VN')}</span> • Hình thức: <span className="text-slate-700 font-bold">{p.method}</span>
                        </p>
                        {p.notes && (
                          <p className="text-[11px] text-slate-400 italic font-medium">
                            Ghi chú: "{p.notes}"
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3.5 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-200">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Số tiền xác nhận:</span>
                          <span className="text-lg font-black text-emerald-600 font-mono">{p.amount.toLocaleString('vi-VN')} ₫</span>
                        </div>

                        <button
                          type="button"
                          disabled={approvingPaymentId !== null}
                          onClick={async () => {
                            if (approvingPaymentId) return;
                            try {
                              setApprovingPaymentId(p.id);
                              await approvePayment(p.id);
                              alert(
                                `Đã duyệt thành công phiếu đóng ${p.amount.toLocaleString('vi-VN')} ₫ ` +
                                `của học viên ${student?.name || ''}.`
                              );
                            } catch (error: any) {
                              alert(`Duyệt phiếu thất bại: ${error?.message || String(error)}`);
                            } finally {
                              setApprovingPaymentId(null);
                            }
                          }}
                          className={`${
                            approvingPaymentId === p.id
                              ? 'bg-amber-500 cursor-not-allowed opacity-80'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          } text-white text-[11px] font-black py-2.5 px-4 rounded-xl cursor-pointer shadow-xs transition-colors uppercase tracking-wider`}
                        >
                          {approvingPaymentId === p.id ? 'Đang duyệt...' : 'Phê duyệt'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB outstanding: OUTSTANDING DEBT LIST */}
      {activeTab === 'outstanding' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <div>
              <span className="text-xs font-black text-slate-800 block uppercase">Danh sách học viên quá hạn đóng phí</span>
              <p className="text-[10px] text-slate-400 font-normal">Học viên còn nợ nhiều chưa gửi đóng trong cam kết</p>
            </div>
            <span className="text-xs font-extrabold text-red-650 bg-red-100 text-red-700 px-2.5 py-1 rounded-lg border border-red-200">
              Cảnh báo: {debtors.length} học viên quá hạn!
            </span>
          </div>

          <div className="space-y-2.5">
            {debtors.map((s) => (
              <div key={s.id} className="p-4 bg-slate-50 border border-slate-100 rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-1 text-xs">
                  <div className="text-slate-800 font-black uppercase">{s.name} ({s.code})</div>
                  <div className="text-slate-500 font-bold">
                    Khóa đào tạo: {s.courseType} • Số ĐT: <strong>{s.phone}</strong>
                  </div>
                  <div className="text-[10px] text-red-500 font-extrabold">
                    Hạn chót thanh toán lý thuyết: {new Date(s.nextPaymentDeadline).toLocaleDateString('vi-VN')} (Quá hạn)
                  </div>
                </div>

                <div className="text-right sm:self-auto self-end">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Còn dư nợ:</span>
                  <span className="text-base font-black text-red-600 font-mono">{s.remainingAmount.toLocaleString('vi-VN')} ₫</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB kpi: ANALYSIS RATIO */}
      {activeTab === 'kpi' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Analysis ratio by course types */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3.5">
            <span className="text-xs font-black text-slate-800 block uppercase">Phân bổ Doanh thu Dự Thu theo Hạng Bằng</span>
            
            <div className="space-y-3 pt-1">
              {Object.entries(courseSummaryData).map(([name, val]: [string, any]) => {
                const ratio = ((val / totalExpected) * 100).toFixed(1);
                return (
                  <div key={name} className="space-y-1.5 text-xs font-bold text-slate-700">
                    <div className="flex justify-between items-center text-[11px]">
                      <span>{name}</span>
                      <span>{val.toLocaleString('vi-VN')} ₫ ({ratio}%)</span>
                    </div>
                    <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="absolute h-full left-0 top-0 bg-blue-600 rounded-full"
                        style={{ width: `${ratio}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ledger audit compliance helper */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 text-xs font-bold text-slate-600">
            <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5 text-blue-600">
              <Receipt className="h-4.5 w-4.5" /> HOẠT ĐỘNG KIỂM TOÁN TÀI CHÍNH
            </h4>

            <p className="leading-relaxed font-semibold text-slate-5xs">
              Mọi chỉnh sửa và tạo phiếu thu luôn ghim kèm Email và thời gian thực hiển hành. Biên lai học phí đã lập sau khi phân bổ không được xóa trực tiếp khỏi bảng số liệu, để đảm bảo kiểm toán thu chi của Ban giám hiệu trường lái không thất thoát.
            </p>

            <ul className="space-y-2.5 pt-2 text-[11px] font-bold">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                <span>Ủy nhiệm Admin mới được phê duyệt hoàn trả.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                <span>Học viên bị hoàn trả phiếu, số dư nợ dời tăng ngược lại.</span>
              </li>
            </ul>
          </div>

        </div>
      )}

      {/* CANCELLATION EXPLANATION FORM (MODAL DIALOG) */}
      {cancellingPayId && (
        <div className="fixed inset-0 bg-slate-900/65 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4 animate-zoom-in">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-red-600 uppercase flex items-center gap-1.5">
                <AlertTriangle className="h-4.5 w-4.5" /> QUY TRÌNH HỦY KHÓA CHỨNG TỪ
              </span>
              <button
                onClick={() => setCancellingPayId(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-bold">
              Nhập lý do thu thập để hủy phiếu thu này. Thao tác hoàn tính, tự động khôi phục số dư nợ cũ của học viên tương ứng.
            </p>

            <div className="space-y-1 text-xs">
              <label className="block text-slate-700 font-bold mb-1">Lý do hủy chứng từ *</label>
              <input
                type="text"
                required
                placeholder="e.g. Chuyển nhầm tiền đặt cọc, Đổi hạng sang khóa B tự động..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-lg text-slate-800 text-xs font-bold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 text-xs font-bold">
              <button
                onClick={() => setCancellingPayId(null)}
                disabled={isCancellingPayment}
                className="bg-slate-100 text-slate-755 hover:bg-slate-200 px-3.5 py-2 rounded-xl cursor-pointer disabled:opacity-55"
              >
                Trở về
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={isCancellingPayment}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl cursor-pointer shadow-xs"
              >
                {isCancellingPayment ? 'Đang hủy phiếu...' : '✓ Đồng ý Hủy Phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
