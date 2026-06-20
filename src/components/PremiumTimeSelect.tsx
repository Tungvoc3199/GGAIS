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

const formatTypingValue = (rawValue: string): string => {
  const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

export const PremiumTimeSelect: React.FC<PremiumTimeSelectProps> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  onBlur,
  className = ''
}) => {
  const [draft, setDraft] = React.useState(value || '');

  React.useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const commitValue = () => {
    const normalized = normalizeTime24h(draft);
    setDraft(normalized);
    onChange(normalized);
    onBlur?.();
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatTypingValue(event.target.value);
    setDraft(formatted);
    if (/^\d{2}:\d{2}$/.test(formatted)) {
      onChange(normalizeTime24h(formatted));
    }
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:mm"
        value={draft}
        required={required}
        disabled={disabled}
        onChange={handleChange}
        onBlur={commitValue}
        onFocus={(event) => event.currentTarget.select()}
        className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 font-mono text-sm font-black tracking-wider text-slate-900 shadow-inner outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-70 ${className}`}
        aria-label="Nhập giờ theo định dạng 24 giờ HH:mm"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-400 shadow-sm">
        24h
      </span>
    </div>
  );
};
