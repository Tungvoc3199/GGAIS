import React from 'react';

type PremiumTimeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  onBlur?: () => void;
  className?: string;
  stepMinutes?: number;
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const normalizeTime24h = (rawValue: string): string => {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';

  const direct = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (direct) {
    const h = Math.min(23, Math.max(0, Number(direct[1])));
    const m = Math.min(59, Math.max(0, Number(direct[2])));
    return `${pad2(h)}:${pad2(m)}`;
  }

  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) {
    const h = Math.min(23, Math.max(0, Number(digits || 0)));
    return `${pad2(h)}:00`;
  }

  const h = Math.min(23, Math.max(0, Number(digits.slice(0, 2))));
  const m = Math.min(59, Math.max(0, Number(digits.slice(2, 4).padEnd(2, '0'))));
  return `${pad2(h)}:${pad2(m)}`;
};

const buildTimeOptions = (stepMinutes: number) => {
  const safeStep = Number.isFinite(stepMinutes) && stepMinutes > 0 ? stepMinutes : 15;
  const options: string[] = [];
  const start = 5 * 60;
  const end = 22 * 60;
  for (let minutes = start; minutes <= end; minutes += safeStep) {
    options.push(`${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`);
  }
  return options;
};

export const PremiumTimeSelect: React.FC<PremiumTimeSelectProps> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  onBlur,
  className = '',
  stepMinutes = 15
}) => {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const normalizedValue = normalizeTime24h(value || '');

  const options = React.useMemo(() => {
    const base = buildTimeOptions(stepMinutes);
    if (normalizedValue && !base.includes(normalizedValue)) {
      return [...base, normalizedValue].sort((a, b) => a.localeCompare(b));
    }
    return base;
  }, [normalizedValue, stepMinutes]);

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

  const chooseTime = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    onBlur?.();
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <input type="hidden" required={required} value={normalizedValue} readOnly />
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(prev => !prev)}
        className={`flex min-h-[46px] w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[13px] font-black leading-none tracking-wider text-slate-900 shadow-inner outline-none transition hover:border-blue-200 hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-70 ${open ? 'border-blue-500 bg-white ring-2 ring-blue-100' : ''} ${className}`}
        aria-label="Chọn giờ theo định dạng 24 giờ HH:mm"
        aria-expanded={open}
      >
        <span className="min-w-0 shrink truncate whitespace-nowrap">{normalizedValue || 'HH:mm'}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-400 shadow-sm">
          24h <span className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 z-[120] mt-2 max-h-72 overflow-y-auto overflow-x-hidden rounded-2xl border border-blue-100 bg-white p-2 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5"
          style={{ width: 'min(280px, calc(100vw - 32px))', minWidth: 240 }}
        >
          <div className="mb-2 px-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
            Chọn giờ 24h
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {options.map(option => {
              const isSelected = option === normalizedValue;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => chooseTime(option)}
                  className={`min-w-0 whitespace-nowrap rounded-xl px-2 py-2 text-center font-mono text-[12px] font-black leading-none transition ${isSelected ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
