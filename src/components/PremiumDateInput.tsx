import React from 'react';

type PremiumDateInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  onBlur?: () => void;
  className?: string;
  placeholder?: string;
};

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTH_NAMES = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

const pad2 = (value: number) => String(value).padStart(2, '0');

const isValidDateParts = (year: number, month: number, day: number) => {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const toISODate = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const fromISODate = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const formatDateVN = (value: string | null | undefined): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidDateParts(year, month, day)) return raw;
    return `${pad2(day)}/${pad2(month)}/${year}`;
  }

  const vnMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (vnMatch) {
    const day = Number(vnMatch[1]);
    const month = Number(vnMatch[2]);
    const year = Number(vnMatch[3]);
    if (!isValidDateParts(year, month, day)) return raw;
    return `${pad2(day)}/${pad2(month)}/${year}`;
  }

  return raw;
};

export const parseDateVNToISO = (value: string | null | undefined): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidDateParts(year, month, day)) return '';
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const vnMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (vnMatch) {
    const day = Number(vnMatch[1]);
    const month = Number(vnMatch[2]);
    const year = Number(vnMatch[3]);
    if (!isValidDateParts(year, month, day)) return '';
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return '';
};

const autoSlashDate = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const buildCalendarDays = (monthCursor: Date) => {
  const firstDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const lastDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  const totalCells = Math.ceil((firstDay.getDay() + lastDay.getDate()) / 7) * 7;
  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

export const PremiumDateInput: React.FC<PremiumDateInputProps> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  onBlur,
  className = '',
  placeholder = 'dd/mm/yyyy'
}) => {
  const [displayValue, setDisplayValue] = React.useState(formatDateVN(value));
  const [open, setOpen] = React.useState(false);
  const [monthCursor, setMonthCursor] = React.useState(() => {
    const iso = parseDateVNToISO(value);
    const date = iso ? fromISODate(iso) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDisplayValue(formatDateVN(value));
    const iso = parseDateVNToISO(value);
    if (iso) {
      const date = fromISODate(iso);
      setMonthCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, onBlur]);

  const commitDisplay = (nextDisplay: string) => {
    setDisplayValue(nextDisplay);
    const iso = parseDateVNToISO(nextDisplay);
    if (iso) {
      onChange(iso);
      const date = fromISODate(iso);
      setMonthCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    } else if (!nextDisplay.trim()) {
      onChange('');
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const nextDisplay = raw.includes('/') || raw.includes('-') || raw.includes('.')
      ? raw.replace(/[.-]/g, '/')
      : autoSlashDate(raw);
    commitDisplay(nextDisplay);
  };

  const handleBlur = () => {
    const iso = parseDateVNToISO(displayValue);
    if (iso) {
      setDisplayValue(formatDateVN(iso));
      onChange(iso);
    }
    onBlur?.();
  };

  const selectedISO = parseDateVNToISO(displayValue || value);
  const todayISO = toISODate(new Date());
  const days = React.useMemo(() => buildCalendarDays(monthCursor), [monthCursor]);

  const chooseDate = (date: Date) => {
    const iso = toISODate(date);
    setDisplayValue(formatDateVN(iso));
    onChange(iso);
    setOpen(false);
    onBlur?.();
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <div className="relative min-w-0">
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          required={required}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`min-h-[46px] w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 pr-10 font-mono text-[13px] font-black leading-none tracking-normal text-slate-900 shadow-inner outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-70 ${open ? 'border-blue-500 bg-white ring-2 ring-blue-100' : ''} ${className}`}
        />
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => !disabled && setOpen(prev => !prev)}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm ring-1 ring-slate-200 transition active:scale-95 disabled:opacity-60"
          aria-label="Mở lịch chọn ngày"
        >
          📅
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 z-[120] mt-2 rounded-3xl border border-blue-100 bg-white p-3 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5"
          style={{ width: 'min(320px, calc(100vw - 32px))', minWidth: 280 }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
              className="h-9 w-9 rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-100 active:scale-95"
            >
              ‹
            </button>
            <div className="text-center">
              <div className="text-sm font-black text-slate-900">{MONTH_NAMES[monthCursor.getMonth()]} / {monthCursor.getFullYear()}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Chọn ngày</div>
            </div>
            <button
              type="button"
              onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
              className="h-9 w-9 rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-100 active:scale-95"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_LABELS.map(day => (
              <div key={day} className="py-1 text-[10px] font-black text-slate-400">{day}</div>
            ))}
            {days.map(day => {
              const iso = toISODate(day);
              const isSelected = iso === selectedISO;
              const isToday = iso === todayISO;
              const isOtherMonth = day.getMonth() !== monthCursor.getMonth();
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => chooseDate(day)}
                  className={`h-9 rounded-xl text-xs font-black transition active:scale-95 ${isSelected ? 'bg-blue-600 text-white shadow-sm' : isToday ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700'} ${isOtherMonth ? 'opacity-40' : ''}`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => chooseDate(new Date())}
              className="rounded-2xl bg-slate-900 px-3 py-2.5 text-xs font-black text-white active:scale-95"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-2xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-700 active:scale-95"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
