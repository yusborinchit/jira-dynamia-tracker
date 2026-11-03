import type { WorkScheduleSetting } from '@/db/defaults';
import { type Range, REPORT_TIMEZONE, wallClockIn, zonedTimeToUtc } from '@/utils/time';

export interface Shift {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface Schedule {
  days: ReadonlySet<number>;
  shifts: readonly Shift[];
  holidays: ReadonlySet<string>;
}

const MAX_DAYS_SCANNED = 11_000;

export function parseClock(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map(Number);
  return { hour: hour ?? 0, minute: minute ?? 0 };
}

export function buildSchedule(setting: WorkScheduleSetting, holidays: Iterable<string>): Schedule {
  return {
    days: new Set(setting.days),
    shifts: setting.shifts.map((shift) => {
      const start = parseClock(shift.from);
      const end = parseClock(shift.to);
      return {
        startHour: start.hour,
        startMinute: start.minute,
        endHour: end.hour,
        endMinute: end.minute,
      };
    }),
    holidays: new Set(holidays),
  };
}

function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function isWorkDay(schedule: Schedule, year: number, monthIndex: number, day: number): boolean {
  if (!schedule.days.has(new Date(Date.UTC(year, monthIndex, day)).getUTCDay())) return false;
  return !schedule.holidays.has(isoDate(year, monthIndex, day));
}

export function workIntervalsInRange(
  range: Range,
  schedule: Schedule,
  tz: string = REPORT_TIMEZONE,
): Range[] {
  const intervals: Range[] = [];
  if (range.to <= range.from) return intervals;

  const { year, month, day } = wallClockIn(range.from, tz);
  const monthIndex = month - 1;

  for (let offset = 0; offset < MAX_DAYS_SCANNED; offset += 1) {
    const dayStart = zonedTimeToUtc(year, monthIndex, day + offset, 0, 0, tz);
    if (dayStart >= range.to) break;
    if (!isWorkDay(schedule, year, monthIndex, day + offset)) continue;

    for (const shift of schedule.shifts) {
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
