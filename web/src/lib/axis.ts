import type { MonthlyReport, WorkInterval } from '@/lib/report';

interface AxisInterval {
  from: number;
  to: number;
  offset: number;
}

export interface DayColumn {
  key: string;
  dayNumber: number;
  weekday: string;
  from: number;
  to: number;
  startPct: number;
  widthPct: number;
}

export interface CompressedAxis {
  intervals: AxisInterval[];
  total: number;
  days: DayColumn[];
}

const WEEKDAY_INITIAL: Record<string, string> = {
  Mon: 'L',
  Tue: 'M',
  Wed: 'M',
  Thu: 'J',
  Fri: 'V',
  Sat: 'S',
  Sun: 'D',
};

export function buildCompressedAxis(report: MonthlyReport): CompressedAxis {
  const timezone = report.work_schedule.timezone;
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });

  const intervals: AxisInterval[] = [];
  let offset = 0;

  for (const raw of report.work_intervals) {
    const from = Date.parse(raw.from);
    const to = Date.parse(raw.to);
    if (to <= from) continue;
    intervals.push({ from, to, offset });
    offset += to - from;
  }

  const total = Math.max(1, offset);

  const byDay = new Map<
    string,
    { from: number; to: number; offsetFrom: number; offsetTo: number }
  >();
  for (const interval of intervals) {
    const key = dateFmt.format(new Date(interval.from));
    const current = byDay.get(key);
    const offsetTo = interval.offset + (interval.to - interval.from);

    if (!current) {
      byDay.set(key, {
        from: interval.from,
        to: interval.to,
        offsetFrom: interval.offset,
        offsetTo,
      });
      continue;
    }

    current.to = Math.max(current.to, interval.to);
    current.offsetTo = Math.max(current.offsetTo, offsetTo);
  }

  const days: DayColumn[] = [...byDay.entries()].map(([key, value]) => ({
    key,
    dayNumber: Number(key.slice(8, 10)),
    weekday: WEEKDAY_INITIAL[weekdayFmt.format(new Date(value.from))] ?? '',
    from: value.from,
    to: value.to,
    startPct: (value.offsetFrom / total) * 100,
    widthPct: ((value.offsetTo - value.offsetFrom) / total) * 100,
  }));

  return { intervals, total, days };
}

export function projectToAxis(utcMs: number, axis: CompressedAxis): number {
  if (axis.intervals.length === 0) return 0;

  let low = 0;
  let high = axis.intervals.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const interval = axis.intervals[middle];
    if (!interval) break;

    if (utcMs < interval.from) {
      high = middle - 1;
    } else if (utcMs > interval.to) {
      low = middle + 1;
    } else {
      return ((interval.offset + (utcMs - interval.from)) / axis.total) * 100;
    }
  }

  const next = axis.intervals[low];
  if (next) return (next.offset / axis.total) * 100;

  const last = axis.intervals[axis.intervals.length - 1];
  return last ? ((last.offset + (last.to - last.from)) / axis.total) * 100 : 100;
}

export function isOnAxis(utcMs: number, axis: CompressedAxis): boolean {
  return axis.intervals.some((interval) => utcMs >= interval.from && utcMs <= interval.to);
}

export interface ProjectedSpan {
  left: number;
  width: number;
  reachesEnd: boolean;
}

const CONTIGUOUS_EPSILON = 0.0001;

export function projectIntervals(
  intervals: readonly WorkInterval[],
  axis: CompressedAxis,
): ProjectedSpan[] {
  const spans: { left: number; right: number }[] = [];

  for (const interval of intervals) {
    const left = projectToAxis(Date.parse(interval.from), axis);
    const right = projectToAxis(Date.parse(interval.to), axis);
    const previous = spans[spans.length - 1];

    if (previous && left <= previous.right + CONTIGUOUS_EPSILON) {
      previous.right = Math.max(previous.right, right);
      continue;
    }

    spans.push({ left, right });
  }

  return spans.map((span, index) => ({
    left: span.left,
    width: Math.max(0, span.right - span.left),
    reachesEnd: index === spans.length - 1,
  }));
}
