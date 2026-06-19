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

export const formatDateVN = (value: string | null | undefined): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  const vnMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (vnMatch) {
    const day = vnMatch[1].padStart(2, '0');
    const month = vnMatch[2].padStart(2, '0');
    const year = vnMatch[3];
    return `${day}/${month}/${year}`;
  }

  return raw;
};

export const parseDateVNToISO = (value: string | null | undefined): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const vnMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (vnMatch) {
    const day = vnMatch[1].padStart(2, '0');
    const month = vnMatch[2].padStart(2, '0');
    const year = vnMatch[3];
    return `${year}-${month}-${day}`;
  }

  return '';
};

const autoSlashDate = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
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

  React.useEffect(() => {
    setDisplayValue(formatDateVN(value));
  }, [value]);

  const commitDisplay = (nextDisplay: string) => {
    setDisplayValue(nextDisplay);
    const iso = parseDateVNToISO(nextDisplay);
    if (iso) {
      onChange(iso);
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

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      required={required}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm font-black tracking-wide text-slate-900 shadow-inner outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-70 ${className}`}
    />
  );
};
