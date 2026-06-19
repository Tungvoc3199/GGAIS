/**
 * Premium in-app dialog and toast system for Lịch Học Pro.
 * Replaces rough browser alerts with branded mobile-first UI.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, Sparkles, X, XCircle } from 'lucide-react';

type DialogTone = 'success' | 'danger' | 'warning' | 'info';
type DialogVariant = 'alert' | 'confirm';

type PremiumAlertOptions = {
  title?: string;
  message: string;
  tone?: DialogTone;
  buttonText?: string;
};

type PremiumConfirmOptions = {
  title?: string;
  message: string;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
};

type PremiumDialogState = {
  open: boolean;
  variant: DialogVariant;
  title: string;
  message: string;
  tone: DialogTone;
  confirmText: string;
  cancelText: string;
  buttonText: string;
  resolve?: (value: boolean) => void;
};

type ToastItem = {
  id: string;
  message: string;
  tone: DialogTone;
  title: string;
};

type PremiumDialogContextValue = {
  alertDialog: (options: PremiumAlertOptions | string) => Promise<void>;
  confirmDialog: (options: PremiumConfirmOptions | string) => Promise<boolean>;
  toast: (message: string, tone?: DialogTone, title?: string) => void;
};

declare global {
  interface Window {
    __lhpToast?: (message: string, tone?: DialogTone, title?: string) => void;
    __lhpAlert?: (options: PremiumAlertOptions | string) => Promise<void>;
    __lhpConfirm?: (options: PremiumConfirmOptions | string) => Promise<boolean>;
  }
}

const PremiumDialogContext = createContext<PremiumDialogContextValue | null>(null);

const toneConfig = {
  success: {
    icon: CheckCircle2,
    halo: 'from-emerald-400/25 to-teal-500/5',
    iconBox: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    title: 'text-emerald-700',
    button: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-500/25',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-100'
  },
  danger: {
    icon: ShieldAlert,
    halo: 'from-red-500/25 to-rose-500/5',
    iconBox: 'bg-red-50 text-red-600 ring-red-100',
    title: 'text-red-700',
    button: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-red-500/25',
    soft: 'bg-red-50 text-red-700 border-red-100'
  },
  warning: {
    icon: AlertTriangle,
    halo: 'from-amber-400/30 to-orange-500/5',
    iconBox: 'bg-amber-50 text-amber-600 ring-amber-100',
    title: 'text-amber-700',
    button: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-amber-500/25',
    soft: 'bg-amber-50 text-amber-700 border-amber-100'
  },
  info: {
    icon: Info,
    halo: 'from-blue-500/25 to-indigo-500/5',
    iconBox: 'bg-blue-50 text-blue-600 ring-blue-100',
    title: 'text-blue-700',
    button: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/25',
    soft: 'bg-blue-50 text-blue-700 border-blue-100'
  }
};

function inferTone(message: string): DialogTone {
  const text = message.toLowerCase();
  if (/(lỗi|thất bại|không thể|từ chối|bị từ chối|xóa|hủy|nguy hiểm)/i.test(text)) return 'danger';
  if (/(cảnh báo|chú ý|trùng|đối soát|xác nhận|kiểm tra)/i.test(text)) return 'warning';
  if (/(thành công|hoàn thành|đã cập nhật|đã lưu|đã gửi)/i.test(text)) return 'success';
  return 'info';
}

function normalizeAlert(options: PremiumAlertOptions | string): PremiumAlertOptions {
  if (typeof options === 'string') {
    return {
      title: inferTone(options) === 'success' ? 'Hoàn tất' : 'Thông báo',
      message: options,
      tone: inferTone(options),
      buttonText: 'Đã hiểu'
    };
  }
  return {
    title: options.title || (options.tone === 'success' ? 'Hoàn tất' : 'Thông báo'),
    message: options.message,
    tone: options.tone || inferTone(options.message),
    buttonText: options.buttonText || 'Đã hiểu'
  };
}

function normalizeConfirm(options: PremiumConfirmOptions | string): PremiumConfirmOptions {
  if (typeof options === 'string') {
    return {
      title: 'Xác nhận thao tác',
      message: options,
      tone: inferTone(options),
      confirmText: 'Đồng ý',
      cancelText: 'Hủy'
    };
  }
  return {
    title: options.title || 'Xác nhận thao tác',
    message: options.message,
    tone: options.tone || inferTone(options.message),
    confirmText: options.confirmText || 'Đồng ý',
    cancelText: options.cancelText || 'Hủy'
  };
}

function isDesktopKeyboardContext(): boolean {
  if (typeof window === 'undefined') return false;
  const hasFinePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  return hasFinePointer ?? window.innerWidth >= 768;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  return Boolean(
    element.isContentEditable ||
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select'
  );
}

export const PremiumDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const nativeAlertRef = useRef<typeof window.alert | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [dialog, setDialog] = useState<PremiumDialogState>({
    open: false,
    variant: 'alert',
    title: '',
    message: '',
    tone: 'info',
    confirmText: 'Đồng ý',
    cancelText: 'Hủy',
    buttonText: 'Đã hiểu'
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: DialogTone = inferTone(message), title?: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const toastTitle = title || (tone === 'success' ? 'Thành công' : tone === 'danger' ? 'Cần kiểm tra' : tone === 'warning' ? 'Lưu ý' : 'Thông báo');
    setToasts(prev => [...prev.slice(-3), { id, message, tone, title: toastTitle }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(item => item.id !== id));
    }, 3200);
  }, []);

  const alertDialog = useCallback((input: PremiumAlertOptions | string) => {
    const options = normalizeAlert(input);
    return new Promise<void>((resolve) => {
      setDialog({
        open: true,
        variant: 'alert',
        title: options.title || 'Thông báo',
        message: options.message,
        tone: options.tone || 'info',
        confirmText: 'Đồng ý',
        cancelText: 'Hủy',
        buttonText: options.buttonText || 'Đã hiểu',
        resolve: () => resolve()
      });
    });
  }, []);

  const confirmDialog = useCallback((input: PremiumConfirmOptions | string) => {
    const options = normalizeConfirm(input);
    return new Promise<boolean>((resolve) => {
      setDialog({
        open: true,
        variant: 'confirm',
        title: options.title || 'Xác nhận thao tác',
        message: options.message,
        tone: options.tone || 'info',
        confirmText: options.confirmText || 'Đồng ý',
        cancelText: options.cancelText || 'Hủy',
        buttonText: 'Đã hiểu',
        resolve
      });
    });
  }, []);

  useEffect(() => {
    setIsHydrated(true);
    nativeAlertRef.current = window.alert;
    window.__lhpToast = toast;
    window.__lhpAlert = alertDialog;
    window.__lhpConfirm = confirmDialog;

    window.alert = (message?: any) => {
      const text = typeof message === 'string' ? message : JSON.stringify(message ?? '');
      alertDialog(text || 'Thông báo');
    };

    return () => {
      if (nativeAlertRef.current) {
        window.alert = nativeAlertRef.current;
      }
      delete window.__lhpToast;
      delete window.__lhpAlert;
      delete window.__lhpConfirm;
    };
  }, [alertDialog, confirmDialog, toast]);

  const closeDialog = (result: boolean) => {
    dialog.resolve?.(result);
    setDialog(prev => ({ ...prev, open: false, resolve: undefined }));
  };

  useEffect(() => {
    if (!dialog.open || dialog.variant !== 'alert' || !isDesktopKeyboardContext()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter' ||
        event.isComposing ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      closeDialog(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog.open, dialog.variant]);

  const value = useMemo(() => ({ alertDialog, confirmDialog, toast }), [alertDialog, confirmDialog, toast]);
  const currentTone = toneConfig[dialog.tone || 'info'];
  const DialogIcon = currentTone.icon;

  return (
    <PremiumDialogContext.Provider value={value}>
      {children}

      <div className="fixed left-0 right-0 top-3 z-[140] mx-auto flex w-full max-w-[430px] flex-col gap-2 px-3 pointer-events-none md:left-auto md:right-5 md:mx-0">
        {toasts.map(item => {
          const config = toneConfig[item.tone];
          const Icon = config.icon;
          return (
            <div
              key={item.id}
              className="pointer-events-auto overflow-hidden rounded-[22px] border border-white/70 bg-white/95 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.18)] backdrop-blur-xl animate-[premiumToastIn_.24s_ease-out]"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${config.iconBox}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-slate-400" />
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{item.title}</p>
                  </div>
                  <p className="mt-1 text-sm font-bold leading-5 text-slate-800">{item.message}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {dialog.open && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-md">
          <div className="absolute inset-0" onClick={() => closeDialog(false)} />
          <div className="relative w-full max-w-[460px] overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)] animate-[premiumDialogIn_.22s_ease-out]">
            <div className={`absolute -right-16 -top-20 h-48 w-48 rounded-full bg-gradient-to-br ${currentTone.halo} blur-2xl`} />
            <div className="relative p-6 sm:p-7">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl ring-1 ${currentTone.iconBox}`}>
                    <DialogIcon className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                      <Sparkles className="h-3.5 w-3.5" /> Lịch Học Pro
                    </p>
                    <h3 className={`text-xl font-black leading-6 tracking-tight ${currentTone.title}`}>{dialog.title}</h3>
                  </div>
                </div>
                <button
                  onClick={() => closeDialog(false)}
                  className="rounded-2xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Đóng thông báo"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="whitespace-pre-line text-[15px] font-semibold leading-7 text-slate-650">{dialog.message}</p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                {dialog.variant === 'confirm' && (
                  <button
                    onClick={() => closeDialog(false)}
                    className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200 active:scale-[0.98]"
                  >
                    {dialog.cancelText}
                  </button>
                )}
                <button
                  onClick={() => closeDialog(true)}
                  className={`rounded-2xl px-5 py-3 text-sm font-black shadow-lg transition active:scale-[0.98] ${currentTone.button}`}
                >
                  {dialog.variant === 'confirm' ? dialog.confirmText : dialog.buttonText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isHydrated && (
        <style>{`
          @keyframes premiumToastIn {
            from { opacity: 0; transform: translateY(-12px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes premiumDialogIn {
            from { opacity: 0; transform: translateY(18px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      )}
    </PremiumDialogContext.Provider>
  );
};

export function usePremiumDialog() {
  const context = useContext(PremiumDialogContext);
  if (!context) {
    throw new Error('usePremiumDialog must be used inside PremiumDialogProvider');
  }
  return context;
}
