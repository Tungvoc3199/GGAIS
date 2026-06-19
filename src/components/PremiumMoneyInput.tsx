import React from 'react';

type PremiumMoneyInputProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  required?: boolean;
  onBlur?: () => void;
  className?: string;
  placeholder?: string;
};

export const formatMoneyCommas = (value: number | string | null | undefined): string => {
  const numeric = Number(String(value ?? '').replace(/[^0-9]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return numeric.toLocaleString('en-US');
};

export const parseMoneyInput = (value: string): number => {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
};

export const PremiumMoneyInput: React.FC<PremiumMoneyInputProps> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  onBlur,
  className = '',
  placeholder = '10,000,000'
}) => {
  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        value={formatMoneyCommas(value)}
        placeholder={placeholder}
        onChange={(event) => onChange(parseMoneyInput(event.target.value))}
        onBlur={onBlur}
        className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-11 font-mono text-sm font-black tracking-wide text-slate-900 shadow-inner outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-70 ${className}`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-slate-400">VNĐ</span>
    </div>
  );
};
