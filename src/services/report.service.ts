import { isTerminalCategory } from '@/db/status-mapping.data';
import { findSegmentsOverlapping } from '@/repositories/history.repository';
import { listIssuesByKeys } from '@/repositories/issue.repository';
import { loadCategoryResolver, UNCATEGORIZED } from '@/repositories/status.repository';
import { clipToRange, monthRange, toIso } from '@/utils/time';

export interface MonthlySegment {
  status_id: string | null;
  status_name: string;
  category: string;
  entered_at: string;
  left_at: string | null;
  /** Bordes ya recortados al mes del reporte: es lo que se dibuja en el Gantt. */
  clipped_from: string;
  clipped_to: string;
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

export interface MonthlyReport {
  month: string;
  from: string;
  to: string;
  generated_at: string;
  issues: MonthlyIssue[];
  totals_by_category: Record<string, number>;
  totals_by_project: Record<string, number>;
}

export function buildMonthlyReport(month: string, now = Date.now()): MonthlyReport {
  const range = monthRange(month);
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
    const seconds = terminal ? 0 : Math.round((clipped.to - clipped.from) / 1000);

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
    month,
    from: new Date(range.from).toISOString(),
    to: new Date(range.to).toISOString(),
    generated_at: new Date(now).toISOString(),
    issues,
    totals_by_category: totalsByCategory,
    totals_by_project: totalsByProject,
  };
}
