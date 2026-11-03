import { ACTIVE_WORK_CATEGORY, UNCATEGORIZED } from '@/db/defaults';
import type { AssigneeHistoryRow } from '@/db/schema';
import {
  findAssignmentsOverlapping,
  listKnownAssignees,
} from '@/repositories/assignment.repository';
import { findSegmentsOverlapping } from '@/repositories/history.repository';
import { listIssues, listIssuesByKeys } from '@/repositories/issue.repository';
import {
  type AppConfig,
  type CategoryConfig,
  categoryList,
  getConfig,
  isTerminal,
} from '@/services/config.service';
import { intersectWorkIntervals, secondsOf, workIntervalsInRange } from '@/utils/business-hours';
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

export interface AssignmentSpan {
  assignee: string;
  from: string;
  to: string | null;
}

export interface MonthlyIssue {
  issue_key: string;
  project_key: string;
  summary: string | null;
  current_status_id: string | null;
  current_status_name: string | null;
  current_category: string | null;
  current_assignee_id: string | null;
  current_assignee_name: string | null;
  current_since: string | null;
  current_work_seconds: number | null;
  total_seconds: number;
  by_category: Record<string, number>;
  by_assignee: Record<string, Record<string, number>>;
  assignments: AssignmentSpan[];
  segments: MonthlySegment[];
}

export interface Report {
  from: string;
  to: string;
  generated_at: string;
  issues: MonthlyIssue[];
  totals_by_category: Record<string, number>;
  totals_by_project: Record<string, number>;
  totals_by_assignee: Record<string, number>;
  assignee_names: Record<string, string>;
  assignee_avatars: Record<string, string>;
  team_members: TeamMember[];
  category_colors: Record<string, string>;
  categories: CategoryConfig[];
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

export interface MonthlyReport extends Report {
  month: string;
}

export const UNASSIGNED = 'unassigned';

const UNASSIGNED_LABEL = 'Sin asignar';

function describeWorkSchedule(config: AppConfig): WorkSchedule {
  return {
    timezone: REPORT_TIMEZONE,
    days: [...config.scheduleSetting.days].sort((a, b) => a - b),
    shifts: config.scheduleSetting.shifts.map((shift) => `${shift.from}-${shift.to}`),
  };
}

function personAlias(config: AppConfig, accountId: string): string | null {
  return config.people.get(accountId)?.alias || null;
}

function splitByAssignee(
  worked: readonly Range[],
  seconds: number,
  assignments: readonly AssigneeHistoryRow[] | undefined,
  now: number,
): [string, number][] {
  if (seconds === 0) return [];

  const byAssignee = new Map<string, number>();
  let attributed = 0;

  for (const assignment of assignments ?? []) {
    const span = {
      from: assignment.enteredAt.getTime(),
      to: assignment.leftAt ? assignment.leftAt.getTime() : now,
    };
    const overlap = secondsOf(intersectWorkIntervals(span, worked));
    if (overlap === 0) continue;

    const key = assignment.accountId ?? UNASSIGNED;
    byAssignee.set(key, (byAssignee.get(key) ?? 0) + overlap);
    attributed += overlap;
  }

  const uncovered = Math.max(0, seconds - attributed);
  if (uncovered > 0) {
    byAssignee.set(UNASSIGNED, (byAssignee.get(UNASSIGNED) ?? 0) + uncovered);
  }

  return [...byAssignee];
}

export function buildMonthlyReport(month: string, now = Date.now()): MonthlyReport {
  return { month, ...buildReport(monthRange(month), now) };
}

export function buildReport(range: Range, now = Date.now()): Report {
  const config = getConfig();
  const workIntervals = workIntervalsInRange(range, config.schedule);
  const resolver = config.resolver;
  const rows = findSegmentsOverlapping(range, now);

  const teamById = new Map<string, TeamMember>();
  for (const assignment of listKnownAssignees()) {
    if (!assignment.accountId || teamById.has(assignment.accountId)) continue;
    teamById.set(assignment.accountId, {
      account_id: assignment.accountId,
      display_name: assignment.displayName ?? assignment.accountId,
      avatar_url: assignment.avatarUrl,
      development_issues: [],
    });
  }

  for (const issue of listIssues()) {
    if (!issue.currentAssigneeId) continue;
    let member = teamById.get(issue.currentAssigneeId);
    if (!member) {
      member = {
        account_id: issue.currentAssigneeId,
        display_name: issue.currentAssigneeName ?? issue.currentAssigneeId,
        avatar_url: issue.currentAssigneeAvatar,
        development_issues: [],
      };
      teamById.set(issue.currentAssigneeId, member);
    }

    if (issue.currentAssigneeName) member.display_name = issue.currentAssigneeName;
    if (issue.currentAssigneeAvatar) member.avatar_url = issue.currentAssigneeAvatar;
    if (resolver.resolve(issue.currentStatusId, issue.currentStatusName) === ACTIVE_WORK_CATEGORY) {
      member.development_issues.push({
        issue_key: issue.issueKey,
        summary: issue.summary,
      });
    }
  }

  for (const member of teamById.values()) {
    member.display_name = personAlias(config, member.account_id) ?? member.display_name;
  }

  const teamMembers = [...teamById.values()]
    .filter((member) => !config.people.get(member.account_id)?.hidden)
    .sort((a, b) => {
      const byWork = a.development_issues.length - b.development_issues.length;
      return byWork || a.display_name.localeCompare(b.display_name, 'es');
    });

  const assignmentsByIssue = new Map<string, AssigneeHistoryRow[]>();
  const assigneeNames: Record<string, string> = { [UNASSIGNED]: UNASSIGNED_LABEL };
  const assigneeAvatars: Record<string, string> = {};

  for (const assignment of findAssignmentsOverlapping(range, now)) {
    const list = assignmentsByIssue.get(assignment.issueKey);
    if (list) list.push(assignment);
    else assignmentsByIssue.set(assignment.issueKey, [assignment]);

    if (!assignment.accountId) continue;
    if (assignment.displayName) assigneeNames[assignment.accountId] = assignment.displayName;
    if (assignment.avatarUrl) assigneeAvatars[assignment.accountId] = assignment.avatarUrl;
  }

  for (const member of teamMembers) {
    assigneeNames[member.account_id] = member.display_name;
    if (member.avatar_url) assigneeAvatars[member.account_id] = member.avatar_url;
  }

  const byIssue = new Map<string, MonthlyIssue>();
  const totalsByCategory: Record<string, number> = {};
  const totalsByAssignee: Record<string, number> = {};

  for (const row of rows) {
    const start = row.enteredAt.getTime();
    const end = row.leftAt ? row.leftAt.getTime() : now;
    const clipped = clipToRange(start, end, range);
    if (!clipped) continue;

    const category = resolver.resolve(row.statusId, row.statusName) ?? UNCATEGORIZED;
    const terminal = isTerminal(config, category);
    const worked = terminal ? [] : intersectWorkIntervals(clipped, workIntervals);
    const seconds = secondsOf(worked);

    let issue = byIssue.get(row.issueKey);
    if (!issue) {
      issue = {
        issue_key: row.issueKey,
        project_key: '',
        summary: null,
        current_status_id: null,
        current_status_name: null,
        current_category: null,
        current_assignee_id: null,
        current_assignee_name: null,
        current_since: null,
        current_work_seconds: null,
        total_seconds: 0,
        by_category: {},
        by_assignee: {},
        assignments: (assignmentsByIssue.get(row.issueKey) ?? []).map((assignment) => ({
          assignee: assignment.accountId ?? UNASSIGNED,
          from: toIso(assignment.enteredAt)!,
          to: toIso(assignment.leftAt),
        })),
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
    if (row.leftAt === null) {
      issue.current_since = toIso(row.enteredAt);
      issue.current_work_seconds = terminal
        ? null
        : secondsOf(workIntervalsInRange({ from: start, to: now }, config.schedule));
    }
    if (terminal) continue;

    issue.total_seconds += seconds;
    issue.by_category[category] = (issue.by_category[category] ?? 0) + seconds;
    totalsByCategory[category] = (totalsByCategory[category] ?? 0) + seconds;

    for (const [assignee, assigned] of splitByAssignee(
      worked,
      seconds,
      assignmentsByIssue.get(row.issueKey),
      now,
    )) {
      issue.by_assignee[assignee] ??= {};
      const buckets = issue.by_assignee[assignee];
      buckets[category] = (buckets[category] ?? 0) + assigned;
      totalsByAssignee[assignee] = (totalsByAssignee[assignee] ?? 0) + assigned;
    }
  }

  const issueKeys = [...byIssue.keys()];
  for (const record of listIssuesByKeys(issueKeys)) {
    const issue = byIssue.get(record.issueKey);
    if (!issue) continue;
    issue.project_key = record.projectKey;
    issue.summary = record.summary;
    issue.current_status_id = record.currentStatusId;
    issue.current_status_name = record.currentStatusName;
    issue.current_category =
      resolver.resolve(record.currentStatusId, record.currentStatusName) ?? UNCATEGORIZED;
    issue.current_assignee_id = record.currentAssigneeId;
    issue.current_assignee_name = record.currentAssigneeName;

    if (!record.currentAssigneeId) continue;
    if (record.currentAssigneeName) {
      assigneeNames[record.currentAssigneeId] = record.currentAssigneeName;
    }
    if (record.currentAssigneeAvatar) {
      assigneeAvatars[record.currentAssigneeId] = record.currentAssigneeAvatar;
    }
  }

  const issues = [...byIssue.values()]
    .filter((issue) => issue.segments.some((segment) => !segment.terminal))
    .sort((a, b) => a.issue_key.localeCompare(b.issue_key));

  for (const accountId of Object.keys(assigneeNames)) {
    const alias = personAlias(config, accountId);
    if (alias) assigneeNames[accountId] = alias;
  }
  for (const issue of issues) {
    if (issue.current_assignee_id) {
      issue.current_assignee_name =
        personAlias(config, issue.current_assignee_id) ?? issue.current_assignee_name;
    }
  }

  const totalsByProject: Record<string, number> = {};
  for (const issue of issues) {
    const key = issue.project_key || 'unknown';
    totalsByProject[key] = (totalsByProject[key] ?? 0) + issue.total_seconds;
  }

  const categories = categoryList(config);

  return {
    from: new Date(range.from).toISOString(),
    to: new Date(range.to).toISOString(),
    generated_at: new Date(now).toISOString(),
    issues,
    totals_by_category: totalsByCategory,
    totals_by_project: totalsByProject,
    totals_by_assignee: totalsByAssignee,
    assignee_names: assigneeNames,
    assignee_avatars: assigneeAvatars,
    team_members: teamMembers,
    category_colors: Object.fromEntries(
      categories.map((category) => [category.key, category.color]),
    ),
    categories,
    work_schedule: describeWorkSchedule(config),
    work_intervals: workIntervals.map((interval) => ({
      from: toIso(interval.from)!,
      to: toIso(interval.to)!,
    })),
  };
}
