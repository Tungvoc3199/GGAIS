/**
 * Safe local timezone date helpers to avoid UTC shifts.
 * Internal storage stays ISO (YYYY-MM-DD), while Vietnamese UI displays dd/mm/yyyy.
 */

export function getLocalTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalOffsetString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseVietnameseDateToISO(dateStr: string): string {
  if (!dateStr) return '';
  const raw = String(dateStr).trim();

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

  return raw;
}

export function formatLocalDate(dateStr: string): string {
  if (!dateStr) return '';
  const iso = parseVietnameseDateToISO(dateStr);
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}
