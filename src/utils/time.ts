export interface Range {
  from: number;
  to: number;
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const REPORT_TIMEZONE = 'America/Montevideo';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(tz, formatter);
  }
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function wallClockIn(utcMs: number, tz: string = REPORT_TIMEZONE): WallClock {
  const parts = partsFormatter(tz).formatToParts(new Date(utcMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const wall = wallClockIn(utcMs, tz);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - utcMs;
}

export function zonedTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  tz: string = REPORT_TIMEZONE,
): number {
  const guess = Date.UTC(year, monthIndex, day, hour, minute);
  const approximate = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(approximate, tz);
}

export function monthRange(month: string, tz: string = REPORT_TIMEZONE): Range {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Invalid month: ${month} (expected YYYY-MM)`);

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error(`Invalid month: ${month}`);

  return {
    from: zonedTimeToUtc(year, monthIndex, 1, 0, 0, tz),
    to: zonedTimeToUtc(year, monthIndex + 1, 1, 0, 0, tz),
  };
}

export function currentMonth(now = new Date(), tz: string = REPORT_TIMEZONE): string {
  const wall = wallClockIn(now.getTime(), tz);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}`;
}

export function currentDate(now = new Date(), tz: string = REPORT_TIMEZONE): string {
  const wall = wallClockIn(now.getTime(), tz);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}

function parseDate(date: string): { year: number; monthIndex: number; day: number } {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Invalid date: ${date} (expected YYYY-MM-DD)`);
  return {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

export function dayRange(date: string, tz: string = REPORT_TIMEZONE): Range {
  const { year, monthIndex, day } = parseDate(date);
  return {
    from: zonedTimeToUtc(year, monthIndex, day, 0, 0, tz),
    to: zonedTimeToUtc(year, monthIndex, day + 1, 0, 0, tz),
  };
}

export function monthRangeForDate(date: string, tz: string = REPORT_TIMEZONE): Range {
  const { year, monthIndex } = parseDate(date);
  return {
    from: zonedTimeToUtc(year, monthIndex, 1, 0, 0, tz),
    to: zonedTimeToUtc(year, monthIndex + 1, 1, 0, 0, tz),
  };
}

export function dayStartsInRange(range: Range, tz: string = REPORT_TIMEZONE): number[] {
  const first = wallClockIn(range.from, tz);
  const days: number[] = [];

  for (let offset = 0; offset < 40; offset += 1) {
    const start = zonedTimeToUtc(first.year, first.month - 1, first.day + offset, 0, 0, tz);
    if (start >= range.to) break;
    days.push(start);
  }

  return days;
}

export function clipToRange(start: number, end: number, range: Range): Range | null {
  const from = Math.max(start, range.from);
  const to = Math.min(end, range.to);
  return to > from ? { from, to } : null;
}

export function toIso(value: Date | number | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';

  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  return `${secs}s`;
}
