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

export function buildCompressedAxis(report: MonthlyReport, intervalGapPct = 0): CompressedAxis {
  const timezone = report.work_schedule.timezone;
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });

  const parsedIntervals = report.work_intervals
    .map((raw) => ({ from: Date.parse(raw.from), to: Date.parse(raw.to) }))
    .filter((interval) => interval.to > interval.from);
  const workingTime = parsedIntervals.reduce(
    (total, interval) => total + interval.to - interval.from,
    0,
  );
  const gapCount = Math.max(0, parsedIntervals.length - 1);
  const requestedGapRatio = (Math.max(0, intervalGapPct) / 100) * gapCount;
  const gapRatio = Math.min(0.9, requestedGapRatio);
  const projectedTotal = workingTime > 0 ? workingTime / (1 - gapRatio) : 0;
  const gapSize = gapCount > 0 ? (projectedTotal * gapRatio) / gapCount : 0;

  const intervals: AxisInterval[] = [];
  let offset = 0;

  parsedIntervals.forEach(({ from, to }, index) => {
    intervals.push({ from, to, offset });
    offset += to - from;
    if (index < parsedIntervals.length - 1) offset += gapSize;
  });

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

export function unprojectFromAxis(axisPct: number, axis: CompressedAxis): number {
  if (axis.intervals.length === 0) return 0;

  const offset = (Math.min(100, Math.max(0, axisPct)) / 100) * axis.total;

  for (const interval of axis.intervals) {
    const intervalEnd = interval.offset + (interval.to - interval.from);
    if (offset <= intervalEnd) {
      return interval.from + Math.max(0, offset - interval.offset);
    }
  }

  return axis.intervals[axis.intervals.length - 1]?.to ?? 0;
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
