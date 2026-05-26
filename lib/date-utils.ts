export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getTodayString(): string {
  return formatDate(new Date());
}

/** Add (or subtract, with negative) days to a YYYY-MM-DD string. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return formatDate(date);
}

/** Parse a YYYY-MM-DD string into a local Date. */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** True if `dateStr` (YYYY-MM-DD) falls on Saturday or Sunday in local time. */
export function isWeekend(dateStr: string): boolean {
  const day = parseDate(dateStr).getDay();
  return day === 0 || day === 6;
}
