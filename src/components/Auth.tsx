/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { UserRole } from '../types';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User as UserIcon,
  Users,
  Wallet,
  Zap
} from 'lucide-react';

type AuthMode = 'login' | 'register' | 'activate';

export const Auth: React.FC = () => {
  const { login, authReady, isSubmittingLogin, isFirebase, toggleDatabaseMode } = useDatabase();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showActivationPassword, setShowActivationPassword] = useState(false);
  const [showActivationConfirm, setShowActivationConfirm] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const demoAccounts = [
    {
      role: 'Admin' as UserRole,
      email: 'admin@lichhocpro.vn',
      label: 'Quản trị viên',
      desc: 'Quản lý toàn bộ hệ thống, thu chi, xếp lịch, cấu hình trung tâm.'
    },
    {
      role: 'Staff' as UserRole,
      email: 'thao.staff@lichhocpro.vn',
      label: 'Lễ tân / Giáo vụ',
      desc: 'Tuyển sinh học viên, xếp lịch và điểm danh.'
    },
    {
      role: 'Accountant' as UserRole,
      email: 'lan.accounting@lichhocpro.vn',
      label: 'Kế toán',
      desc: 'Theo dõi học phí, công nợ và báo cáo thu chi.'
    },
    {
      role: 'Instructor' as UserRole,
      email: 'hung.nv@lichhocpro.vn',
      label: 'Giáo viên',
      desc: 'Xem lịch dạy riêng và cập nhật kết quả buổi học.'
    }
  ];

  const isProduction = (import.meta as any).env.PROD === true;
  const demoModeEnabled = String((import.meta as any).env.VITE_ENABLE_DEMO_MODE) === 'true';
  const showToggle = !isProduction && ((import.meta as any).env.DEV === true || demoModeEnabled);

  const getLocalDemoPassword = () => ['Default', 'Password', '123'].join('');

  const clearMessages = () => {
    setError('');
    setInfo('');
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!email) {
      setError('Vui lòng nhập số điện thoại, email hoặc biệt danh tài khoản.');
      return;
    }

    if (!password) {
      setError('Vui lòng nhập mật khẩu đăng nhập.');
      return;
    }

    try {
      if (isFirebase) {
        const success = await login(email.trim().toLowerCase(), password);
        if (!success) {
          setError('Xác thực thất bại. Vui lòng thử lại.');
        }
      } else {
        const lowerEmail = email.toLowerCase().trim();
        let targetEmail = email;
        if (lowerEmail === 'admin') targetEmail = 'admin@lichhocpro.vn';
        else if (lowerEmail === 'teacher' || lowerEmail === 'instructor' || lowerEmail === 'giaovien') targetEmail = 'hung.nv@lichhocpro.vn';
        else if (lowerEmail === 'staff' || lowerEmail === 'letan') targetEmail = 'thao.staff@lichhocpro.vn';
        else if (lowerEmail === 'accountant' || lowerEmail === 'ketoan') targetEmail = 'lan.accounting@lichhocpro.vn';
        else if (!targetEmail.includes('@')) targetEmail = `${targetEmail}@lichhocpro.vn`;

        const success = await login(targetEmail, password);
        if (!success) {
          setError('Xác thực thất bại. Vui lòng thử lại.');
        }
      }
    } catch (err: any) {
      console.error('Lỗi đăng nhập manual:', err);
      let errMsg = err.message || 'Xác thực không thành công. Hãy chắc chắn mật khẩu đúng.';
      if (err.code === 'auth/operation-not-allowed' || errMsg.includes('operation-not-allowed')) {
        errMsg = showToggle
          ? 'Firebase chưa bật Email/Password. Có thể chuyển sang Simulation (Local) để test giao diện và dữ liệu mẫu.'
          : 'Firebase chưa kích hoạt phương thức Email/Password. Vui lòng bật trong Firebase Console trước khi dùng production.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || errMsg.includes('mật khẩu') || errMsg.includes('Mật khẩu')) {
        errMsg = 'Mật khẩu nhập vào không chính xác cho tài khoản này.';
      } else if (err.code === 'auth/network-request-failed') {
        errMsg = 'Lỗi kết nối mạng Firebase. Vui lòng kiểm tra lại thiết bị.';
      } else if (err.code === 'auth/too-many-requests') {
        errMsg = 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần. Thử lại sau.';
      }
      setError(errMsg);
    }
  };

  const handleQuickLogin = async (demoEmail: string, demoRole: UserRole) => {
    clearMessages();
    if (isProduction || !showToggle) {
      setError('Đăng nhập nhanh Demo đã bị khóa trên môi trường Production. Vui lòng dùng tài khoản Firebase thật.');
      return;
    }

    try {
      const success = await login(demoEmail, getLocalDemoPassword());
      if (!success) {
        setError(`Không thể đăng nhập tài khoản demo ${demoRole}.`);
      }
    } catch (err: any) {
      console.error('Lỗi đăng nhập nhanh demo:', err);
      let errMsg = err.message || 'Không thể đăng nhập tài khoản demo.';
      if (err.code === 'auth/operation-not-allowed' || errMsg.includes('operation-not-allowed')) {
        errMsg = 'Firebase chưa bật Email/Password. Hãy chọn Simulation (Local) để test nhanh giao diện.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/email-already-in-use') {
        errMsg = `Tài khoản demo (${demoEmail}) đã được cài mật khẩu riêng. Vui lòng đăng nhập thủ công.`;
      } else if (err.code === 'auth/network-request-failed') {
        errMsg = 'Lỗi kết nối mạng đến máy chủ Firebase.';
      }
      setError(errMsg);
    }
  };

  const handleUiOnlySubmit = (e: React.FormEvent, target: 'trial' | 'activate') => {
    e.preventDefault();
    setError('');
    setInfo(
      target === 'trial'
        ? 'Form đăng ký trung tâm đã sẵn sàng giao diện. Bước sau sẽ nối backend tạo workspace trung tâm.'
        : 'Form kích hoạt tài khoản đã sẵn sàng giao diện. Bước sau sẽ nối backend kích hoạt/mời tài khoản.'
    );
  };

  const leftBenefits =
    mode === 'register'
      ? [
          { icon: Zap, text: 'Thiết lập nhanh' },
          { icon: Users, text: 'Quản lý theo trung tâm' },
          { icon: BarChart3, text: 'Báo cáo rõ ràng' },
          { icon: Cloud, text: 'Sẵn sàng mở rộng SaaS' }
        ]
      : mode === 'activate'
        ? [
            { icon: KeyRound, text: 'Nhập mã kích hoạt' },
            { icon: Lock, text: 'Tạo mật khẩu mới' },
            { icon: UserIcon, text: 'Đăng nhập và sử dụng ngay' },
            { icon: ShieldCheck, text: 'Bảo mật theo từng vai trò' }
          ]
        : [
            { icon: CalendarDays, text: 'Xếp lịch tự động' },
            { icon: ClipboardCheck, text: 'Theo dõi DAT thực tế' },
            { icon: Wallet, text: 'Quản lý học phí - công nợ' },
            { icon: Bell, text: 'Nhắc lịch thi và học bù' }
          ];

  const inputBase =
    'w-full rounded-2xl border border-white/10 bg-slate-100 px-4 py-3.5 pl-11 text-sm text-slate-950 outline-none transition-all placeholder:text-slate-500 focus:border-blue-400/70 focus:bg-white focus:ring-4 focus:ring-blue-500/10';

  const labelBase = 'mb-2 block text-xs font-bold tracking-wide text-slate-200';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06101e] font-sans text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(37,99,235,0.24),transparent_30%),radial-gradient(circle_at_18%_78%,rgba(16,185,129,0.14),transparent_28%)]" />
      <div className="absolute left-[-4rem] top-[-2rem] h-80 w-80 rounded-full border-[34px] border-white/[0.035]" />
      <div className="absolute left-[17%] top-8 select-none text-[9rem] font-black leading-none tracking-[-0.08em] text-white/[0.035] md:text-[12rem]">
        QLHV
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-56 bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.92))]" />
      <div className="absolute bottom-8 left-8 hidden h-px w-[42rem] rotate-[-8deg] bg-gradient-to-r from-blue-400/0 via-blue-400/20 to-emerald-400/0 md:block" />

      <div className="relative z-10 grid min-h-screen grid-cols-1 items-center gap-8 px-5 py-8 lg:grid-cols-[1fr_0.88fr] lg:px-16">
        <section className="mx-auto w-full max-w-2xl space-y-7">
          <div className="inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-blue-500/10 backdrop-blur">
              <Car className="h-7 w-7 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black tracking-tight text-white">QLHV</span>
              <span className="rounded-lg bg-blue-500 px-2 py-1 text-xs font-black text-white shadow-lg shadow-blue-500/30">PRO</span>
            </div>
          </div>

          <div>
            <h1 className="text-5xl font-black tracking-tight text-white md:text-7xl">
              QLHV <span className="bg-gradient-to-r from-blue-300 to-blue-600 bg-clip-text text-transparent">Pro</span>
            </h1>
            <p className="mt-4 text-2xl font-extrabold text-emerald-400">
              {mode === 'register' ? 'Đăng ký dùng thử cho trung tâm' : 'Quản lý trung tâm dạy lái xe thông minh'}
            </p>
            <p className="mt-4 max-w-xl text-base font-medium leading-7 text-slate-300">
              {mode === 'activate'
                ? 'Dành cho giáo viên, lễ tân và học viên đã được trung tâm cấp tài khoản.'
                : mode === 'register'
                  ? 'Tạo tài khoản trung tâm để quản lý học viên, lịch học, giáo viên, xe, DAT, học phí và lịch thi.'
                  : 'Quản lý học viên, lịch học, giáo viên, xe, DAT, học phí và lịch thi trên một nền tảng duy nhất.'}
            </p>
          </div>

          <div className="grid max-w-xl gap-3">
            {leftBenefits.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="group flex items-center gap-4 border-b border-white/[0.06] pb-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-emerald-400 shadow-lg shadow-emerald-500/5 transition group-hover:border-emerald-300/30 group-hover:bg-emerald-400/10">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-base font-semibold text-slate-200">{item.text}</span>
                </div>
              );
            })}
          </div>

          <div className="hidden grid-cols-3 gap-3 pt-4 md:grid">
            <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/20 backdrop-blur">
              <p className="text-xs font-black text-white">Lịch học</p>
              <div className="mt-4 space-y-2 text-[10px] text-slate-300">
                {['07:00 Tập lái - Sa hình', '09:30 Đường trường', '13:30 Bổ túc tay lái'].map((row) => (
                  <div key={row} className="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">{row}</div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/20 backdrop-blur">
              <p className="text-xs font-black text-white">Tiến độ DAT</p>
              <div className="mx-auto mt-4 flex h-24 w-24 items-center justify-center rounded-full border-[8px] border-emerald-400/80 text-xl font-black text-white shadow-lg shadow-emerald-400/10">
                72%
              </div>
              <p className="mt-3 text-center text-[10px] font-semibold text-slate-400">Đạt yêu cầu</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/20 backdrop-blur">
              <p className="text-xs font-black text-white">Học phí</p>
              <div className="mt-4 space-y-2 text-[11px] font-bold">
                <p className="text-emerald-400">Đã thu 980,500,000đ</p>
                <p className="text-orange-300">Còn phải thu 269,500,000đ</p>
                <p className="text-slate-400">Công nợ quá hạn: 5</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <div className="rounded-[2rem] border border-white/15 bg-white/[0.08] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-9">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-blue-300/30 bg-blue-500/10 shadow-[0_0_40px_rgba(59,130,246,0.25)]">
                {mode === 'register' ? <Building2 className="h-10 w-10 text-white" /> : mode === 'activate' ? <KeyRound className="h-10 w-10 text-white" /> : <Car className="h-10 w-10 text-white" />}
              </div>
              <h2 className="text-3xl font-black text-white md:text-4xl">
                {mode === 'register' ? 'Tạo tài khoản trung tâm' : mode === 'activate' ? 'Kích hoạt tài khoản' : 'Đăng nhập'}
              </h2>
              <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-blue-500 to-blue-300" />
            </div>

            {showToggle && (
              <div className="mb-5 inline-flex w-full rounded-2xl border border-white/10 bg-slate-950/40 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    toggleDatabaseMode(false);
                    clearMessages();
                  }}
                  className={`flex-1 rounded-xl px-3 py-2 transition ${isFirebase ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'}`}
                >
                  Cloud Firebase
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleDatabaseMode(true);
                    clearMessages();
                  }}
                  className={`flex-1 rounded-xl px-3 py-2 transition ${!isFirebase ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white'}`}
                >
                  Simulation Local
                </button>
              </div>
            )}

            {isFirebase && !authReady && mode === 'login' && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-3 text-xs font-medium text-blue-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                Đang khởi tạo kết nối Cloud. Anh vẫn có thể thử đăng nhập.
              </div>
            )}

            {(error || info) && (
              <div className={`mb-4 flex items-start gap-2 rounded-2xl border p-3 text-xs font-medium ${error ? 'border-red-400/20 bg-red-400/10 text-red-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'}`}>
                {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />}
                <span>{error || info}</span>
              </div>
            )}

            {mode === 'login' && (
              <form className="space-y-5" onSubmit={handleManualLogin}>
                <div>
                  <label className={labelBase}>Số điện thoại / Email</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Nhập số điện thoại hoặc email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputBase}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelBase}>Mật khẩu</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Nhập mật khẩu"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputBase} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-white/20 bg-white/10 accent-blue-500" />
                    Ghi nhớ đăng nhập
                  </label>
                  <button type="button" className="text-blue-300 hover:text-blue-200">Quên mật khẩu?</button>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingLogin === true}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-400 to-blue-700 px-5 py-4 text-base font-black text-white shadow-xl shadow-blue-600/25 transition hover:scale-[1.01] disabled:opacity-50"
                >
                  {isSubmittingLogin ? 'Đang xác thực...' : 'Đăng nhập'}
                  <ArrowRight className="h-5 w-5" />
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form className="space-y-4" onSubmit={(e) => handleUiOnlySubmit(e, 'trial')}>
                {[
                  { label: 'Tên trung tâm', icon: Building2 },
                  { label: 'Tên người quản lý', icon: UserIcon },
                  { label: 'Số điện thoại', icon: Phone },
                  { label: 'Email', icon: Mail },
                  { label: 'Tỉnh / Thành phố', icon: MapPin },
                  { label: 'Quy mô học viên / tháng', icon: Users }
                ].map((field) => {
                  const Icon = field.icon;
                  return (
                    <div key={field.label} className="relative">
                      <Icon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input type="text" placeholder={field.label} className={inputBase} />
                    </div>
                  );
                })}
                <button className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-400 to-blue-700 px-5 py-4 text-base font-black text-white shadow-xl shadow-blue-600/25 transition hover:scale-[1.01]">
                  Tạo tài khoản dùng thử
                  <ArrowRight className="h-5 w-5" />
                </button>
                <p className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                  Dùng thử nhanh - không cần thẻ thanh toán
                </p>
              </form>
            )}

            {mode === 'activate' && (
              <form className="space-y-4" onSubmit={(e) => handleUiOnlySubmit(e, 'activate')}>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input type="text" placeholder="Mã kích hoạt / Link mời" className={inputBase} />
                </div>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input type="text" placeholder="Số điện thoại / Email" className={inputBase} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input type={showActivationPassword ? 'text' : 'password'} placeholder="Mật khẩu mới" className={`${inputBase} pr-12`} />
                  <button
                    type="button"
                    onClick={() => setShowActivationPassword((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={showActivationPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
                    title={showActivationPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
                  >
                    {showActivationPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input type={showActivationConfirm ? 'text' : 'password'} placeholder="Xác nhận mật khẩu" className={`${inputBase} pr-12`} />
                  <button
                    type="button"
                    onClick={() => setShowActivationConfirm((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={showActivationConfirm ? 'Ẩn xác nhận mật khẩu' : 'Hiện xác nhận mật khẩu'}
                    title={showActivationConfirm ? 'Ẩn xác nhận mật khẩu' : 'Hiện xác nhận mật khẩu'}
                  >
                    {showActivationConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs font-medium text-slate-400">Liên kết kích hoạt có thời hạn bảo mật</p>
                <button className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-400 to-blue-700 px-5 py-4 text-base font-black text-white shadow-xl shadow-blue-600/25 transition hover:scale-[1.01]">
                  Kích hoạt tài khoản
                  <ArrowRight className="h-5 w-5" />
                </button>
              </form>
            )}

            <div className="mt-6 space-y-4">
              {mode === 'login' && (
                <>
                  <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                    <div className="h-px flex-1 bg-white/10" />
                    hoặc
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                  <button type="button" onClick={() => { setMode('register'); clearMessages(); }} className="flex w-full items-center justify-center gap-2 text-sm font-bold text-emerald-300 hover:text-emerald-200">
                    <Building2 className="h-4 w-4" />
                    Đăng ký dùng thử cho trung tâm
                  </button>
                  <button type="button" onClick={() => { setMode('activate'); clearMessages(); }} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
                    <KeyRound className="h-4 w-4" />
                    Đã được cấp tài khoản? <span className="text-blue-300">Kích hoạt tại đây</span>
                  </button>
                </>
              )}

              {mode !== 'login' && (
                <div className="space-y-3 text-center text-sm font-semibold text-slate-300">
                  <button type="button" onClick={() => { setMode('login'); clearMessages(); }} className="text-blue-300 hover:text-blue-200">
                    {mode === 'register' ? 'Đã có tài khoản? Đăng nhập' : 'Đã kích hoạt? Đăng nhập'}
                  </button>
                  <div className="flex items-center justify-center gap-2 text-emerald-300">
                    <Headphones className="h-4 w-4" />
                    {mode === 'register' ? 'Cần tư vấn? Liên hệ hỗ trợ' : 'Cần hỗ trợ? Liên hệ Admin'}
                  </div>
                </div>
              )}
            </div>

            {showToggle && !isFirebase && mode === 'login' && (
              <div className="mt-7">
                <div className="mb-4 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <div className="h-px flex-1 bg-white/10" />
                  Đăng nhập nhanh Demo
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid gap-2">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.role}
                      type="button"
                      onClick={() => handleQuickLogin(acc.email, acc.role)}
                      className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-left transition hover:border-blue-300/30 hover:bg-blue-500/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-black text-white">{acc.label}</span>
                        <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2 py-0.5 text-[10px] font-black text-blue-200">{acc.role}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">Email: {acc.email}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{acc.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs font-semibold text-slate-500">© QLHV Pro</p>
        </section>
      </div>
    </div>
  );
};
