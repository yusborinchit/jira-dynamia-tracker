import { queryOptions } from '@tanstack/react-query';

export interface WorkInterval {
  from: string;
  to: string;
}

export interface Segment {
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

export interface AssignmentSpan {
  assignee: string;
  from: string;
  to: string | null;
}

export interface Issue {
  issue_key: string;
  project_key: string;
  summary: string | null;
  current_status_name: string | null;
  current_category: string | null;
  current_assignee_id: string | null;
  current_assignee_name: string | null;
  total_seconds: number;
  by_category: Record<string, number>;
  by_assignee: Record<string, Record<string, number>>;
  assignments: AssignmentSpan[];
  segments: Segment[];
}

export interface WorkSchedule {
  timezone: string;
  days: number[];
  shifts: string[];
}

export type Span = 'day' | 'month';

export interface MonthlyReport {
  span: Span;
  date: string;
  from: string;
  to: string;
  generated_at: string;
  issues: Issue[];
  totals_by_category: Record<string, number>;
  totals_by_project: Record<string, number>;
  totals_by_assignee: Record<string, number>;
  assignee_names: Record<string, string>;
  assignee_avatars: Record<string, string>;
  team_members: TeamMember[];
  category_colors: Record<string, string>;
  work_schedule: WorkSchedule;
  work_intervals: WorkInterval[];
}

export interface TeamMember {
  account_id: string;
  display_name: string;
  avatar_url: string | null;
  development_issues: {
    issue_key: string;
    summary: string | null;
  }[];
}

async function fetchReport(date: string, span: Span): Promise<MonthlyReport> {
  const response = await fetch(`/reports/range?date=${date}&span=${span}`);
  if (!response.ok) {
    throw new Error(`El servidor respondió ${response.status}`);
  }
  return response.json() as Promise<MonthlyReport>;
}

export function reportQuery(date: string, span: Span) {
  return queryOptions({
    queryKey: ['report', span, date] as const,
    queryFn: () => fetchReport(date, span),
    staleTime: 30_000,
  });
}

export function currentDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function shiftDate(date: string, span: Span, delta: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = { y: year ?? 1970, m: (month ?? 1) - 1, d: day ?? 1 };

  const shifted =
    span === 'month'
      ? new Date(Date.UTC(base.y, base.m + delta, base.d))
      : new Date(Date.UTC(base.y, base.m, base.d + delta));

  const iso = shifted.toISOString();
  return iso.slice(0, 10);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
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

const MIN_SEGMENT_SECONDS = 300;

// A status that only lasted a few minutes is almost always a misclick on the
// board. Totals keep it; the timelines hide it so the bars stay readable.
export function isBlip(segment: Segment): boolean {
  return !segment.open && segment.seconds < MIN_SEGMENT_SECONDS;
}

export function categoryLabel(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const UNCATEGORIZED = 'uncategorized';

export const CATEGORY_COLOR_FALLBACK = '#ec4899';

export const CATEGORY_ORDER = [
  'development',
  'testing',
  'deploy',
  'waiting_info',
  'pending',
  UNCATEGORIZED,
  'done',
];

export function categoryRank(category: string | null): number {
  const index = category === null ? -1 : CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

export function currentCategoryOf(issue: Issue): string {
  return issue.current_category ?? UNCATEGORIZED;
}

export function categoryColor(report: MonthlyReport, category: string): string {
  return report.category_colors[category] ?? CATEGORY_COLOR_FALLBACK;
}

export function allCategories(report: MonthlyReport): string[] {
  const seen = new Set<string>();
  for (const issue of report.issues) {
    for (const segment of issue.segments) seen.add(segment.category);
  }
  return [...seen].sort();
}

export function allProjects(report: MonthlyReport): string[] {
  return [...new Set(report.issues.map((issue) => issue.project_key || 'unknown'))].sort();
}

export const UNASSIGNED = 'unassigned';

export function assigneeLabel(report: MonthlyReport, key: string): string {
  return report.assignee_names[key] ?? (key === UNASSIGNED ? 'Sin asignar' : key);
}

export interface TimeSpan {
  from: number;
  to: number;
}

export function spansOf(intervals: readonly WorkInterval[]): TimeSpan[] {
  return intervals.map((interval) => ({
    from: Date.parse(interval.from),
    to: Date.parse(interval.to),
  }));
}

function overlapSeconds(a: TimeSpan, spans: readonly TimeSpan[]): number {
  let ms = 0;
  for (const span of spans) {
    const from = Math.max(a.from, span.from);
    const to = Math.min(a.to, span.to);
    if (to > from) ms += to - from;
  }
  return Math.round(ms / 1000);
}

export function assigneesOf(
  report: MonthlyReport,
  issue: Issue,
  spans: readonly TimeSpan[],
): { assignee: string; seconds: number }[] {
  const total = spans.reduce((acc, span) => acc + Math.max(0, span.to - span.from), 0) / 1000;
  const seconds = new Map<string, number>();
  const now = Date.parse(report.generated_at);
  let covered = 0;

  for (const assignment of issue.assignments) {
    const span = {
      from: Date.parse(assignment.from),
      to: assignment.to ? Date.parse(assignment.to) : now,
    };
    const overlap = overlapSeconds(span, spans);
    if (overlap === 0) continue;
    seconds.set(assignment.assignee, (seconds.get(assignment.assignee) ?? 0) + overlap);
    covered += overlap;
  }

  const uncovered = Math.round(total - covered);
  if (uncovered > 0) seconds.set(UNASSIGNED, (seconds.get(UNASSIGNED) ?? 0) + uncovered);

  return [...seconds]
    .map(([assignee, value]) => ({ assignee, seconds: value }))
    .sort((a, b) => b.seconds - a.seconds);
}

export function allAssignees(report: MonthlyReport): string[] {
  const seen = new Set<string>();
  for (const issue of report.issues) {
    for (const assignee of Object.keys(issue.by_assignee)) seen.add(assignee);
  }
  return [...seen].sort(
    (a, b) => (report.totals_by_assignee[b] ?? 0) - (report.totals_by_assignee[a] ?? 0),
  );
}
