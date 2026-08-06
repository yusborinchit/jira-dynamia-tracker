import { CATEGORY_COLORS, isTerminalCategory, UNCATEGORIZED_COLOR } from '@/db/status-mapping.data';
import { findSegmentsOverlapping } from '@/repositories/history.repository';
import { listIssuesByKeys } from '@/repositories/issue.repository';
import { loadCategoryResolver, UNCATEGORIZED } from '@/repositories/status.repository';
import {
  intersectWorkIntervals,
  secondsOf,
  WORK_DAYS,
  WORK_SHIFTS,
  workIntervalsInRange,
} from '@/utils/business-hours';
import { clipToRange, monthRange, type Range, REPORT_TIMEZONE, toIso } from '@/utils/time';

export interface WorkSchedule {
  timezone: string;
  days: number[];
  shifts: string[];
}

export interface WorkInterval {
  from: string;
  to: string;
}

export interface MonthlySegment {
  status_id: string | null;
  status_name: string;
  category: string;
  entered_at: string;
  left_at: string | null;
  clipped_from: string;
  clipped_to: string;
  work_intervals: WorkInterval[];
  open: boolean;
  terminal: boolean;
  seconds: number;
}

export interface MonthlyIssue {
  issue_key: string;
  project_key: string;
  summary: string | null;
  current_status_name: string | null;
  total_seconds: number;
  by_category: Record<string, number>;
  segments: MonthlySegment[];
}

export interface Report {
  from: string;
  to: string;
  generated_at: string;
  issues: MonthlyIssue[];
  totals_by_category: Record<string, number>;
  totals_by_project: Record<string, number>;
  category_colors: Record<string, string>;
  work_schedule: WorkSchedule;
  work_intervals: WorkInterval[];
}

export interface MonthlyReport extends Report {
  month: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function describeWorkSchedule(): WorkSchedule {
  return {
    timezone: REPORT_TIMEZONE,
    days: [...WORK_DAYS].sort((a, b) => a - b),
    shifts: WORK_SHIFTS.map(
      (shift) =>
        `${pad2(shift.startHour)}:${pad2(shift.startMinute)}-${pad2(shift.endHour)}:${pad2(shift.endMinute)}`,
    ),
  };
}

export function buildMonthlyReport(month: string, now = Date.now()): MonthlyReport {
  return { month, ...buildReport(monthRange(month), now) };
}

export function buildReport(range: Range, now = Date.now()): Report {
  const workIntervals = workIntervalsInRange(range);
  const resolver = loadCategoryResolver();
  const rows = findSegmentsOverlapping(range, now);

  const byIssue = new Map<string, MonthlyIssue>();
  const totalsByCategory: Record<string, number> = {};

  for (const row of rows) {
    const start = row.enteredAt.getTime();
    const end = row.leftAt ? row.leftAt.getTime() : now;
    const clipped = clipToRange(start, end, range);
    if (!clipped) continue;

    const category = resolver.resolve(row.statusId, row.statusName) ?? UNCATEGORIZED;
    const terminal = isTerminalCategory(category);
    const worked = terminal ? [] : intersectWorkIntervals(clipped, workIntervals);
    const seconds = secondsOf(worked);

    let issue = byIssue.get(row.issueKey);
    if (!issue) {
      issue = {
        issue_key: row.issueKey,
        project_key: '',
        summary: null,
        current_status_name: null,
        total_seconds: 0,
        by_category: {},
        segments: [],
      };
      byIssue.set(row.issueKey, issue);
    }

    issue.segments.push({
      status_id: row.statusId,
      status_name: row.statusName,
      category,
      entered_at: toIso(row.enteredAt)!,
      left_at: toIso(row.leftAt),
      clipped_from: toIso(clipped.from)!,
      clipped_to: toIso(clipped.to)!,
      work_intervals: worked.map((interval) => ({
        from: toIso(interval.from)!,
        to: toIso(interval.to)!,
      })),
      open: row.leftAt === null,
      terminal,
      seconds,
    });
    if (terminal) continue;

    issue.total_seconds += seconds;
    issue.by_category[category] = (issue.by_category[category] ?? 0) + seconds;
    totalsByCategory[category] = (totalsByCategory[category] ?? 0) + seconds;
  }

  const issueKeys = [...byIssue.keys()];
  for (const record of listIssuesByKeys(issueKeys)) {
    const issue = byIssue.get(record.issueKey);
    if (!issue) continue;
    issue.project_key = record.projectKey;
    issue.summary = record.summary;
    issue.current_status_name = record.currentStatusName;
  }

  const issues = [...byIssue.values()]
    .filter((issue) => issue.segments.some((segment) => !segment.terminal))
    .sort((a, b) => a.issue_key.localeCompare(b.issue_key));

  const totalsByProject: Record<string, number> = {};
  for (const issue of issues) {
    const key = issue.project_key || 'unknown';
    totalsByProject[key] = (totalsByProject[key] ?? 0) + issue.total_seconds;
  }

  return {
    from: new Date(range.from).toISOString(),
    to: new Date(range.to).toISOString(),
    generated_at: new Date(now).toISOString(),
    issues,
    totals_by_category: totalsByCategory,
    totals_by_project: totalsByProject,
    category_colors: { ...CATEGORY_COLORS, [UNCATEGORIZED]: UNCATEGORIZED_COLOR },
    work_schedule: describeWorkSchedule(),
    work_intervals: workIntervals.map((interval) => ({
      from: toIso(interval.from)!,
      to: toIso(interval.to)!,
    })),
  };
}
