import { type Range, REPORT_TIMEZONE, wallClockIn, zonedTimeToUtc } from '@/utils/time';

export interface Shift {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export const WORK_SHIFTS: readonly Shift[] = [
  { startHour: 9, startMinute: 0, endHour: 13, endMinute: 0 },
  { startHour: 14, startMinute: 0, endHour: 18, endMinute: 0 },
];

export const WORK_DAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);

export const WORK_SECONDS_PER_DAY = WORK_SHIFTS.reduce(
  (acc, shift) =>
    acc + (shift.endHour * 60 + shift.endMinute - (shift.startHour * 60 + shift.startMinute)) * 60,
  0,
);

const MAX_DAYS_SCANNED = 11_000;

function isWorkDay(year: number, monthIndex: number, day: number): boolean {
  return WORK_DAYS.has(new Date(Date.UTC(year, monthIndex, day)).getUTCDay());
}

export function workIntervalsInRange(range: Range, tz: string = REPORT_TIMEZONE): Range[] {
  const intervals: Range[] = [];
  if (range.to <= range.from) return intervals;

  const { year, month, day } = wallClockIn(range.from, tz);
  const monthIndex = month - 1;

  for (let offset = 0; offset < MAX_DAYS_SCANNED; offset += 1) {
    const dayStart = zonedTimeToUtc(year, monthIndex, day + offset, 0, 0, tz);
    if (dayStart >= range.to) break;
    if (!isWorkDay(year, monthIndex, day + offset)) continue;

    for (const shift of WORK_SHIFTS) {
      const from = Math.max(
        zonedTimeToUtc(year, monthIndex, day + offset, shift.startHour, shift.startMinute, tz),
        range.from,
      );
      const to = Math.min(
        zonedTimeToUtc(year, monthIndex, day + offset, shift.endHour, shift.endMinute, tz),
        range.to,
      );
      if (to > from) intervals.push({ from, to });
    }
  }

  return intervals;
}

export function intersectWorkIntervals(range: Range, workIntervals: readonly Range[]): Range[] {
  const parts: Range[] = [];

  for (const interval of workIntervals) {
    if (interval.from >= range.to) break;
    if (interval.to <= range.from) continue;

    const from = Math.max(interval.from, range.from);
    const to = Math.min(interval.to, range.to);
    if (to > from) parts.push({ from, to });
  }

  return parts;
}

export function secondsOf(intervals: readonly Range[]): number {
  const ms = intervals.reduce((acc, interval) => acc + (interval.to - interval.from), 0);
  return Math.round(ms / 1000);
}

export function businessSecondsBetween(
  from: number,
  to: number,
  tz: string = REPORT_TIMEZONE,
): number {
  if (to <= from) return 0;
  return secondsOf(workIntervalsInRange({ from, to }, tz));
}
