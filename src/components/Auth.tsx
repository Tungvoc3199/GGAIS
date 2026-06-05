/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { UserRole } from '../types';
import { ShieldCheck, User as UserIcon, Keyboard, AlertCircle, Car } from 'lucide-react';

export const Auth: React.FC = () => {
  const { login, loading, isFirebase, toggleDatabaseMode } = useDatabase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Predefined demo accounts
  const demoAccounts = [
    {
      role: 'Admin' as UserRole,
      email: 'admin@lichhocpro.vn',
      desc: 'Quản lý toàn bộ hệ thống, thu chi, xếp lịch, cấu hình trường lái.',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    {
      role: 'Staff' as UserRole,
      email: 'thao.staff@lichhocpro.vn',
      desc: 'Tuyển sinh học viên, xếp lịch và điểm danh. Không có quyền xóa doanh thu.',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200'
    },
    {
      role: 'Accountant' as UserRole,
      email: 'lan.accounting@lichhocpro.vn',
      desc: 'Quản lý thu chi học viên, thực hiện các báo cáo tài chính.',
      badgeColor: 'bg-violet-100 text-violet-800 border-violet-200'
    },
    {
      role: 'Instructor' as UserRole,
      email: 'hung.nv@lichhocpro.vn',
      desc: 'Xem lịch phân công riêng, cập nhật ghi chú chất lượng buổi tập.',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    }
  ];

  const showToggle = (import.meta as any).env.DEV || (import.meta as any).env.VITE_ENABLE_DEMO_MODE === 'true';

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Vui lòng nhập địa chỉ thư điện tử.');
      return;
    }

    if (!password) {
      setError('Vui lòng nhập mật khẩu xác thực.');
      return;
    }

    // Match with our local simulation emails
    const lowerEmail = email.toLowerCase().trim();
    let assignedRole: UserRole = 'Staff';

    if (lowerEmail === 'admin@lichhocpro.vn' || lowerEmail === 'admin') {
      assignedRole = 'Admin';
    } else if (lowerEmail === 'hung.nv@lichhocpro.vn' || lowerEmail === 'teacher' || lowerEmail === 'instructor') {
      assignedRole = 'Instructor';
    } else if (lowerEmail === 'thao.staff@lichhocpro.vn' || lowerEmail === 'staff') {
      assignedRole = 'Staff';
    }

    try {
      let targetEmail = email;
      if (lowerEmail === 'admin') targetEmail = 'admin@lichhocpro.vn';
      else if (lowerEmail === 'teacher' || lowerEmail === 'instructor') targetEmail = 'hung.nv@lichhocpro.vn';
      else if (lowerEmail === 'staff') targetEmail = 'thao.staff@lichhocpro.vn';
      else if (!targetEmail.includes('@')) targetEmail = `${targetEmail}@lichhocpro.vn`;

      const success = await login(targetEmail, assignedRole, password);
      if (!success) {
        setError('Xác thực thất bại. Vui lòng thử lại.');
      }
    } catch (err: any) {
      console.error('Lỗi đăng nhập manual:', err);
      let errMsg = err.message || 'Xác thực không thành công. Hãy chắc chắn mật khẩu đúng.';
      if (err.code === 'auth/operation-not-allowed' || errMsg.includes('operation-not-allowed')) {
        errMsg = 'auth/operation-not-allowed: Dự án Firebase của bạn chưa kích hoạt phương thức Đăng nhập bằng Email/Password. Hãy vào Firebase Console > Authentication > Sign-in method để bật, hoặc chọn "Simulation (LocalStorage)" phía trên để dùng thử offline đầy đủ tính năng ngay.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || errMsg.includes('mật khẩu') || errMsg.includes('Mật khẩu')) {
        errMsg = 'Mật khẩu nhập vào không chính xác cho tài khoản này.';
      } else if (err.code === 'auth/network-request-failed') {
        errMsg = 'Lỗi kết nối mạng Firebase. Vui lòng kiểm tra lại thiết bị của bạn.';
      } else if (err.code === 'auth/too-many-requests') {
        errMsg = 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần. Thử lại sau.';
      }
      setError(errMsg);
    }
  };

  const handleQuickLogin = async (demEmail: string, demRole: UserRole) => {
    setError('');
    try {
      const success = await login(demEmail, demRole);
      if (!success) {
        setError('Không thể đăng nhập tài khoản demo.');
      }
    } catch (err: any) {
      console.error('Lỗi đăng nhập nhanh demo:', err);
      let errMsg = err.message || 'Không thể đăng nhập tài khoản demo.';
      if (err.code === 'auth/operation-not-allowed' || errMsg.includes('operation-not-allowed')) {
        errMsg = 'auth/operation-not-allowed: Dự án Firebase này chưa kích hoạt phương thức Đăng nhập bằng Email/Password. Vui lòng vào Firebase Console để bật, hoặc bật chế độ "Simulation (LocalStorage)" phía trên để bỏ qua xác thực Cloud!';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/email-already-in-use' || errMsg.includes('mật khẩu') || errMsg.includes('Mật khẩu')) {
        errMsg = `Tài khoản demo (${demEmail}) đã được cài đặt mật khẩu riêng. Vui lòng đăng nhập với thông tin tài khoản và mật khẩu của quý khách ở phần nhập thủ công.`;
      } else if (err.code === 'auth/network-request-failed') {
        errMsg = 'Lỗi kết nối mạng đến máy chủ Firebase.';
      }
      setError(errMsg);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center items-center gap-2 mb-2">
          <div className="bg-blue-600 text-white p-2.5 rounded-2xl shadow-md shadow-blue-200">
            <Car className="h-7 w-7" />
          </div>
          <span className="text-2xl font-black text-slate-800 tracking-tight">LỊCH HỌC PRO</span>
        </div>
        <p className="text-sm font-medium text-slate-500">
          Chuyên nghiệp hóa quản lý lịch trình giảng dạy và sổ thu chi trường lái
        </p>

        {/* Quick Config Database Mode Toggle (Visible only in DEV/Demo environments) */}
        {showToggle && (
          <div className="mt-4 flex justify-center">
            <div className="inline-flex rounded-2xl bg-slate-200/50 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  toggleDatabaseMode(false);
                  setError('');
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isFirebase 
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-100' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ☁️ Cloud (Firebase)
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleDatabaseMode(true);
                  setError('');
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !isFirebase 
                    ? 'bg-white text-amber-700 shadow-sm border border-slate-100' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                💾 Simulation (Local)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-slate-100 rounded-3xl sm:px-10">
          <form className="space-y-6" onSubmit={handleManualLogin}>
            {error && (
              <div className="rounded-xl bg-red-50 p-3 border border-red-100 flex flex-col gap-2 bg-gradient-to-br from-red-50/50 to-amber-50/50">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <span className="text-xs text-red-800 font-medium leading-relaxed">{error}</span>
                </div>
                {error.includes('auth/operation-not-allowed') && (
                  <div className="mt-2 text-xs border-t border-slate-100 pt-2 text-slate-600 flex flex-col gap-1.5">
                    <p className="font-semibold text-slate-700">💡 Hướng dẫn bật trên Firebase Console:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-[11px] mb-1">
                      <li>Truy cập mục <strong>Authentication &gt; Sign-in method</strong>.</li>
                      <li>Kích hoạt phương thức đăng nhập <strong>Email/Password</strong>.</li>
                    </ol>
                    <button
                      type="button"
                      onClick={() => {
                        toggleDatabaseMode(true);
                        setError('Đã kích hoạt Chế độ Mô phỏng / Ngoại tuyến (Simulation)! Quý khách có thể bấm nhanh vào các tài khoản Demo bên dưới để đăng nhập ngay.');
                      }}
                      className="w-full py-2.5 px-3 rounded-xl text-[11px] font-black text-white bg-amber-600 hover:bg-amber-700 transition duration-150 cursor-pointer shadow-sm uppercase tracking-wider text-center"
                    >
                      Bỏ qua và dùng thử Offline Simulation
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-2">
                Tài khoản Email / Biệt danh
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="admin@lichhocpro.vn hoạc 'admin'"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-2">
                Mật khẩu đăng nhập
              </label>
              <input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3.5 px-4 rounded-2xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-all cursor-pointer shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {loading ? 'Đang xác thực thông tin...' : 'ĐĂNG NHẬP HỆ THỐNG'}
            </button>
          </form>

          {showToggle && (
            <div className="mt-8">
              <div className="relative flex items-center justify-center mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100"></div>
                </div>
                <span className="relative px-3 bg-white text-xs font-bold uppercase tracking-widest text-slate-400">
                  Đăng nhập nhanh Demo
                </span>
              </div>

              <div className="space-y-3">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.role}
                    type="button"
                    onClick={() => handleQuickLogin(acc.email, acc.role)}
                    className="w-full text-left p-3.5 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/10 active:bg-blue-50/20 transition-all cursor-pointer flex flex-col gap-1 group w-full"
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                        {acc.role === 'Admin' ? '👤 Quản Trị Viên (Admin)' : acc.role === 'Staff' ? '💼 Giáo Vụ/Tuyển Sinh (Staff)' : acc.role === 'Accountant' ? '💰 Kế Toán Trọng Điểm (Accountant)' : '🚗 Giảng Viên Dạy Lái (Instructor)'}
                      </span>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${acc.badgeColor}`}>
                        {acc.role}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 group-hover:text-slate-500 transition-colors">
                      Email: {acc.email}
                    </span>
                    <span className="text-[11px] leading-relaxed text-slate-500 mt-0.5">
                      {acc.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
