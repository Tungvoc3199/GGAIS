/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { Students } from './components/Students';
import { Schedule } from './components/Schedule';
import { AutoScheduler } from './components/AutoScheduler';
import { Finance } from './components/Finance';
import { Instructors } from './components/Instructors';
import { Vehicles } from './components/Vehicles';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';

import {
  Home,
  Calendar,
  Users,
  DollarSign,
  Award,
  Car,
  FileSpreadsheet,
  Settings as SettingsIcon,
  LogOut,
  PlusCircle,
  Sparkles,
  Layers,
  Menu,
  X,
  Plus
} from 'lucide-react';

function AppContent() {
  const { currentUser, logout, settings, isFirebase, cloudConnectionError, authReady } = useDatabase();

  // Navigation views state
  const [activeView, setActiveView] = useState<string>('tong-quan');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  // States for triggering modals inside children
  const [quickStudentForm, setQuickStudentForm] = useState(false);
  const [quickLessonForm, setQuickLessonForm] = useState(false);

  if (!currentUser) {
    return <Auth />;
  }

  // Sidebar list representing the 9 sections requested for desktop
  const desktopNavItems = [
    { id: 'tong-quan', label: 'Tổng quan', icon: Home },
    { id: 'lich-hoc', label: 'Lịch học', icon: Calendar },
    { id: 'hoc-vien', label: 'Học viên', icon: Users },
    { id: 'doanh-thu', label: 'Doanh thu', icon: DollarSign },
    { id: 'cong-no', label: 'Công nợ', icon: Layers },
    { id: 'giang-vien', label: 'Giảng viên', icon: Award },
    { id: 'xe-tap', label: 'Xe tập lái', icon: Car },
    { id: 'bao-cao', label: 'Báo cáo', icon: FileSpreadsheet },
    { id: 'cai-dat', label: 'Cài đặt', icon: SettingsIcon }
  ];

  // Bottom navigation items (5 options) requested for mobile
  const mobileNavItems = [
    { id: 'tong-quan', label: 'Tổng quan', icon: Home },
    { id: 'lich-hoc', label: 'Lịch học', icon: Calendar },
    { id: 'hoc-vien', label: 'Học viên', icon: Users },
    { id: 'finance', label: 'Thu chi', icon: DollarSign } // links to Doanh thu panel
  ];

  const handleMobileNavigate = (view: string) => {
    setActiveView(view);
    setMobileMenuOpen(false);
  };

  const isDark = settings?.theme === 'dark';

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800 antialiased selection:bg-blue-105 selection:text-blue-900 pb-16 md:pb-0 ${isDark ? 'dark-theme' : ''}`}>
      
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 shrink-0 border-r border-slate-800 shadow-xl justify-between h-screen sticky top-0">
        <div className="flex flex-col p-5 space-y-5 overflow-y-auto">
          {/* Logo Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-850">
              <div className="h-9 w-9 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white text-sm shadow-md shadow-blue-500/20">
                LHP
              </div>
              <div>
                <h1 className="text-sm font-black text-white tracking-widest leading-none">LỊCH HỌC PRO</h1>
                <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block mt-0.5">Driving School</span>
              </div>
            </div>

            {isFirebase ? (
              isFirebase === true && cloudConnectionError === null && authReady === true ? (
                <div className="bg-emerald-950/30 border border-emerald-900/50 py-1.5 px-3 rounded-xl flex items-center gap-2 text-[10px] text-emerald-400 font-extrabold select-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="truncate">CLOUD FIRESTORE SYNC</span>
                </div>
              ) : (
                <div className="bg-rose-950/30 border border-rose-900/50 py-1.5 px-3 rounded-xl flex items-center gap-2 text-[10px] text-rose-400 font-extrabold select-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
                  <span className="truncate">CLOUD ERROR</span>
                </div>
              )
            ) : (
              <div className="bg-amber-950/30 border border-amber-900/50 py-1.5 px-3 rounded-xl flex items-center gap-2 text-[10px] text-amber-500 font-extrabold select-none">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <span className="truncate">OFFLINE DB FALLBACK</span>
              </div>
            )}
          </div>

          {/* Nav Categories */}
          <nav className="space-y-1.5 text-xs font-bold">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              const matches = activeView === item.id || (item.id === 'doanh-thu' && activeView === 'finance') || (item.id === 'cong-no' && activeView === 'finance');
              
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-3 py-3 px-4 rounded-xl transition-all cursor-pointer ${matches ? 'bg-blue-600 text-white font-extrabold shadow-sm shadow-blue-500/10' : 'hover:bg-slate-800/60 hover:text-white'}`}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* AI Feature Shortcut for scheduling */}
          <div className="pt-2">
            <button
              onClick={() => setActiveView('auto-schedule')}
              className={`w-full text-xs font-bold py-3.5 px-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-650 hover:to-indigo-650 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer`}
            >
              <Sparkles className="h-4 w-4 text-amber-300" />
              <span>Xếp Lịch Thông Minh Tự Động</span>
            </button>
          </div>
        </div>

        {/* User profile footer info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-slate-800 rounded-full flex items-center justify-center font-black uppercase text-xs text-blue-400">
              {currentUser.displayName.slice(0, 1)}
            </div>
            <div className="text-[11px] font-bold">
              <span className="text-slate-100 block truncate">{currentUser.displayName}</span>
              <span className="text-slate-500 uppercase block text-[9px] tracking-wide mt-0.5">{currentUser.role === 'Admin' ? '🎯 Admin' : currentUser.role === 'Staff' ? '💼 Tuyển sinh' : '👨‍🏫 Giáo viên'}</span>
            </div>
          </div>

          <button
            onClick={() => {
              logout();
              setActiveView('tong-quan');
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 border border-slate-800 hover:border-slate-700 bg-transparent text-slate-400 hover:text-white text-[10px] font-black rounded-lg cursor-pointer transition-all"
          >
            <LogOut className="h-3.5 w-3.5" /> THOÁT HỆ THỐNG
          </button>
        </div>
      </aside>

      {/* MOBILE TOP HEADER BAR */}
      <header className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-3.5 flex justify-between items-center text-white sticky top-0 z-45">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 text-slate-350 hover:bg-slate-800 hover:text-white rounded-lg cursor-pointer mr-0.5"
            title="Danh mục menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white text-xs">
            L
          </div>
          <span className="text-xs font-black tracking-widest font-sans uppercase">LỊCH HỌC PRO</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
            {currentUser.role === 'Admin' ? '🎯 Admin' : currentUser.role === 'Staff' ? '💼 Staff' : '👨‍🏫 Thầy'}
          </span>
          <button
            onClick={() => setActiveView('cai-dat')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${activeView === 'cai-dat' ? 'bg-blue-600/30 text-blue-400' : 'text-slate-350 hover:bg-slate-800 hover:text-white'}`}
            title="Cài đặt"
          >
            <SettingsIcon className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={logout}
            className="p-1.5 text-slate-350 hover:bg-slate-800 hover:text-white rounded-lg cursor-pointer transition-colors"
            title="Đăng xuất"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* MOBILE EXPANDED NAVIGATION SLIDE SIDEBAR */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 md:hidden flex animate-fade-in backdrop-blur-xs">
          <div className="bg-slate-900 text-slate-300 w-72 h-full p-5 border-r border-slate-800 shadow-2xl flex flex-col justify-between overflow-y-auto animate-slide-left">
            <div className="space-y-5">
              {/* Header inside drawer */}
              <div className="flex justify-between items-center pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white text-xs shadow-md shadow-blue-500/20">
                    LHP
                  </div>
                  <div>
                    <h1 className="text-xs font-black text-white tracking-widest leading-none">LỊCH HỌC PRO</h1>
                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider block mt-0.5">Driving School</span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                  title="Đóng menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Status Info */}
              {isFirebase ? (
                isFirebase === true && cloudConnectionError === null && authReady === true ? (
                  <div className="bg-emerald-950/30 border border-emerald-900/50 py-1.5 px-3 rounded-xl flex items-center gap-2 text-[9px] text-emerald-400 font-extrabold select-none">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="truncate">CLOUD FIRESTORE SYNC</span>
                  </div>
                ) : (
                  <div className="bg-rose-950/30 border border-rose-900/50 py-1.5 px-3 rounded-xl flex items-center gap-2 text-[9px] text-rose-400 font-extrabold select-none">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
                    <span className="truncate">CLOUD ERROR</span>
                  </div>
                )
              ) : (
                <div className="bg-amber-950/30 border border-amber-900/50 py-1.5 px-3 rounded-xl flex items-center gap-2 text-[9px] text-amber-500 font-extrabold select-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="truncate">OFFLINE DB FALLBACK</span>
                </div>
              )}

              {/* Nav Options */}
              <nav className="space-y-1 text-xs font-bold">
                {desktopNavItems.map((item) => {
                  const Icon = item.icon;
                  const matches = activeView === item.id || (item.id === 'doanh-thu' && activeView === 'finance') || (item.id === 'cong-no' && activeView === 'finance');
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleMobileNavigate(item.id)}
                      className={`w-full flex items-center gap-3 py-2.5 px-4 rounded-xl transition-all cursor-pointer ${matches ? 'bg-blue-600 text-white font-extrabold shadow-sm' : 'hover:bg-slate-800/60 hover:text-white'}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Smart Automation Button */}
              <div className="pt-1.5">
                <button
                  onClick={() => handleMobileNavigate('auto-schedule')}
                  className="w-full text-xs font-bold py-3 px-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-650 hover:to-indigo-650 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <span>Xếp Lịch Thông Minh Tự Động</span>
                </button>
              </div>
            </div>

            {/* Profile footer inside slider */}
            <div className="p-3 border-t border-slate-805 bg-slate-950 rounded-2xl flex flex-col gap-2.5 mt-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 bg-slate-800 rounded-full flex items-center justify-center font-black uppercase text-xs text-blue-400">
                  {currentUser.displayName.slice(0, 1)}
                </div>
                <div className="text-[10px] font-bold">
                  <span className="text-slate-100 block truncate max-w-[150px]">{currentUser.displayName}</span>
                  <span className="text-slate-500 uppercase block text-[8px] tracking-wide mt-0.5">{currentUser.role === 'Admin' ? '🎯 Admin' : currentUser.role === 'Staff' ? '💼 Tuyển sinh' : '👨‍🏫 Giáo viên'}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                  setActiveView('tong-quan');
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 border border-slate-800 hover:border-slate-700 bg-transparent text-slate-400 hover:text-white text-[9px] font-black rounded-lg cursor-pointer transition-all"
              >
                <LogOut className="h-3 w-3" /> THOÁT HỆ THỐNG
              </button>
            </div>
          </div>
          
          {/* Dimmed rest-of-screen area to close when tapped */}
          <div onClick={() => setMobileMenuOpen(false)} className="flex-1 h-full cursor-pointer" />
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 grid grid-cols-5 p-1 z-40 text-slate-400 text-[10px] font-bold">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id || (item.id === 'finance' && activeView === 'doanh-thu') || (item.id === 'finance' && activeView === 'cong-no');
          return (
            <button
              key={item.id}
              onClick={() => handleMobileNavigate(item.id)}
              className={`flex flex-col items-center justify-center py-2 gap-1 cursor-pointer transition-all ${active ? 'text-blue-500' : 'hover:text-slate-200'}`}
            >
              <Icon className="h-4.5 w-4.5" />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* 5. Quick Add option representing floating action trigger */}
        <button
          onClick={() => setQuickActionOpen(true)}
          className="flex flex-col items-center justify-center py-2 gap-1 text-emerald-500 cursor-pointer hover:scale-105 transition-transform"
        >
          <PlusCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
          <span>Thêm mới</span>
        </button>
      </nav>

      {/* MAIN VIEW CONTROLLER CANVAS */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6 pb-20 md:pb-6 relative">
        {isFirebase && cloudConnectionError && (
          <div className="mb-4 rounded-2xl bg-red-650 text-white p-4 flex flex-col items-start gap-2.5 shadow-md border border-red-700 bg-gradient-to-r from-red-600 to-red-750 select-none">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div className="text-xs font-bold leading-relaxed">
                <span className="block font-black text-xs uppercase tracking-wide">KHÔNG THỂ ĐỒNG BỘ CLOUD — VUI LÒNG KIỂM TRA KẾT NỐI. KHÔNG NHẬP DỮ LIỆU.</span>
                <span className="text-red-100 font-medium block mt-1">{cloudConnectionError}</span>
              </div>
            </div>
          </div>
        )}

        {!isFirebase && (
          <div className="mb-4 rounded-2xl bg-red-650 text-white p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm border border-red-700 bg-gradient-to-r from-red-600 to-red-750 select-none">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⚠️</span>
              <div className="text-xs font-bold leading-relaxed">
                <span className="block font-black uppercase tracking-wider text-[10px]">DEMO MODE — DỮ LIỆU CHỈ LƯU TRÊN THIẾT BỊ, KHÔNG ĐỒNG BỘ CLOUD</span>
                <span className="text-red-100 font-medium">Lịch học, thu chi lái xe hiện tại được lưu cục bộ trên trình duyệt Web này. Vui lòng kết nối Firebase để lưu dữ liệu an toàn.</span>
              </div>
            </div>
            <button
              onClick={() => setActiveView('cai-dat')}
              className="shrink-0 bg-white/20 hover:bg-white/30 text-white rounded-xl px-3.5 py-1.5 text-[10px] font-black tracking-widest uppercase transition-all cursor-pointer"
            >
              Xem Cấu Hình
            </button>
          </div>
        )}

        {activeView === 'tong-quan' && (
          <Dashboard
            onNavigate={setActiveView}
            onOpenQuickForm={(formType) => {
              if (formType === 'student') {
                setActiveView('hoc-vien');
                setQuickStudentForm(true);
              } else if (formType === 'schedule') {
                setActiveView('lich-hoc');
                setQuickLessonForm(true);
              } else if (formType === 'payment') {
                setActiveView('finance');
              }
            }}
          />
        )}

        {activeView === 'lich-hoc' && (
          <Schedule
            quickFormOpen={quickLessonForm}
            onCloseQuickForm={() => setQuickLessonForm(false)}
          />
        )}

        {activeView === 'hoc-vien' && (
          <Students
            quickFormOpen={quickStudentForm}
            onCloseQuickForm={() => setQuickStudentForm(false)}
            quickFormType="student"
          />
        )}

        {(activeView === 'doanh-thu' || activeView === 'cong-no' || activeView === 'finance') && (
          <Finance />
        )}

        {activeView === 'giang-vien' && (
          <Instructors />
        )}

        {activeView === 'xe-tap' && (
          <Vehicles />
        )}

        {activeView === 'bao-cao' && (
          <Reports />
        )}

        {activeView === 'cai-dat' && (
          <Settings />
        )}

        {activeView === 'auto-schedule' && (
          <AutoScheduler onNavigate={setActiveView} />
        )}
      </main>

      {/* MOBILE QUICK ADD - DIAL SHEETS DIALOG OVERLAY */}
      {quickActionOpen && (
        <div className="fixed inset-0 bg-slate-900/65 z-50 backdrop-blur-xs flex items-end md:hidden">
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-4 animate-slide-left relative">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <span className="text-xs font-black text-slate-800 uppercase tracking-widest">⚡ thao tác nhanh di động</span>
              <button
                onClick={() => setQuickActionOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-700">
              
              <button
                onClick={() => {
                  setQuickActionOpen(false);
                  setActiveView('hoc-vien');
                  setQuickStudentForm(true);
                }}
                className="p-4 bg-slate-50 border border-slate-100 hover:border-blue-150 rounded-2xl flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
              >
                <Users className="h-5 w-5 text-blue-600" />
                <span>+ Học viên mới</span>
              </button>

              <button
                onClick={() => {
                  setQuickActionOpen(false);
                  setActiveView('lich-hoc');
                  setQuickLessonForm(true);
                }}
                className="p-4 bg-slate-50 border border-slate-100 hover:border-blue-150 rounded-2xl flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
              >
                <Calendar className="h-5 w-5 text-blue-600" />
                <span>+ Xếp một ca học</span>
              </button>

              <button
                onClick={() => {
                  setQuickActionOpen(false);
                  setActiveView('auto-schedule');
                }}
                className="p-4 bg-slate-50 border border-slate-100 hover:border-blue-150 rounded-2xl flex flex-col items-center justify-center gap-2 text-center cursor-pointer col-span-2"
              >
                <Sparkles className="h-5 w-5 text-amber-500" />
                <span>🚀 Chạy Xếp ca thông minh</span>
              </button>

            </div>

            <div className="pt-2 text-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">LỊCH HỌC PRO v2.6.0</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function App() {
  return (
    <DatabaseProvider>
      <AppContent />
    </DatabaseProvider>
  );
}
