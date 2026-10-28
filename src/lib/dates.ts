/** Local calendar day as YYYY-MM-DD (the user's day, not UTC). */
export function toDay(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return toDay(new Date(y, m - 1, d + delta));
}

export function fromDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dayLabel(day: string): string {
  const today = toDay();
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  if (day === addDays(today, 1)) return 'Tomorrow';
  return fromDay(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** A workout's length to the second: "1h 05m 12s", "45m 03s", "38s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${s}s`;
}

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The Monday that starts the week containing `day`. */
export function mondayOf(day: string): string {
  const offset = (fromDay(day).getDay() + 6) % 7;
  return addDays(day, -offset);
}

/** The first day of the month containing `day`. */
export function firstOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}
