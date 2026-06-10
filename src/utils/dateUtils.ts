/**
 * Safe Vietnam timezone date helpers to avoid UTC shifts.
 */

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function getZonedDateString(date: Date = new Date(), timezone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getLocalTodayString(): string {
  return getZonedDateString();
}

export function getLocalOffsetString(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return getZonedDateString(date);
}

export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}
