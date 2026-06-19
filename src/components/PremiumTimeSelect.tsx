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

const buildTimeOptions = (stepMinutes = 15) => {
  const options: string[] = [];
  const safeStep = Number.isFinite(stepMinutes) && stepMinutes > 0 ? stepMinutes : 15;
  for (let total = 0; total < 24 * 60; total += safeStep) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
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
  const options = React.useMemo(() => {
    const base = buildTimeOptions(stepMinutes);
    if (value && !base.includes(value)) {
      return [...base, value].sort();
    }
    return base;
  }, [stepMinutes, value]);

  return (
    <div className="relative w-full">
      <select
        value={value || ''}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={`w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-9 font-mono text-sm font-black tracking-wider text-slate-900 shadow-inner outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-70 ${className}`}
      >
        <option value="" disabled>--:--</option>
        {options.map((time) => (
          <option key={time} value={time}>{time}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">⌄</span>
    </div>
  );
};
