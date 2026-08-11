import {
  assigneeLabel,
  categoryLabel,
  currentCategoryOf,
  type Issue,
  type MonthlyReport,
} from '@/lib/report';

export interface ReportFilters {
  projects: string[];
  categories: string[];
  assignees: string[];
  search: string;
}

export const EMPTY_FILTERS: ReportFilters = {
  projects: [],
  categories: [],
  assignees: [],
  search: '',
};

export type MatchFn = (issueKey: string, category?: string) => boolean;

export interface FilteredReport {
  report: MonthlyReport;
  matches: MatchFn;
  matchedIssues: number;
}

function matchesSearch(issue: Issue, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return (
    issue.issue_key.toLowerCase().includes(needle) ||
    (issue.summary ?? '').toLowerCase().includes(needle) ||
    (issue.current_status_name ?? '').toLowerCase().includes(needle) ||
    (issue.current_assignee_name ?? '').toLowerCase().includes(needle) ||
    categoryLabel(currentCategoryOf(issue)).toLowerCase().includes(needle)
  );
}

function restrictToAssignees(issue: Issue, assignees: ReadonlySet<string>): Issue {
  if (assignees.size === 0) return issue;

  const byCategory: Record<string, number> = {};
  let total = 0;

  for (const [assignee, buckets] of Object.entries(issue.by_assignee)) {
    if (!assignees.has(assignee)) continue;
    for (const [category, seconds] of Object.entries(buckets)) {
      byCategory[category] = (byCategory[category] ?? 0) + seconds;
      total += seconds;
    }
  }

  return { ...issue, by_category: byCategory, total_seconds: total };
}

export function applyFilters(report: MonthlyReport, filters: ReportFilters): FilteredReport {
  const projects = new Set(filters.projects);
  const categories = new Set(filters.categories);
  const assignees = new Set(filters.assignees);

  const matchesCategory = (category: string): boolean =>
    categories.size === 0 || categories.has(category);

  const matched = new Set<string>();

  for (const issue of report.issues) {
    if (projects.size > 0 && !projects.has(issue.project_key || 'unknown')) continue;
    if (!matchesSearch(issue, filters.search)) continue;
    if (!issue.segments.some((segment) => !segment.terminal && matchesCategory(segment.category))) {
      continue;
    }
    if (assignees.size > 0 && !Object.keys(issue.by_assignee).some((key) => assignees.has(key))) {
      continue;
    }
    matched.add(issue.issue_key);
  }

  const totalsByCategory: Record<string, number> = {};
  const totalsByProject: Record<string, number> = {};
  const totalsByAssignee: Record<string, number> = {};

  for (const issue of report.issues) {
    if (!matched.has(issue.issue_key)) continue;
    const project = issue.project_key || 'unknown';

    for (const [assignee, buckets] of Object.entries(issue.by_assignee)) {
      if (assignees.size > 0 && !assignees.has(assignee)) continue;
      for (const [category, seconds] of Object.entries(buckets)) {
        if (!matchesCategory(category)) continue;
        totalsByCategory[category] = (totalsByCategory[category] ?? 0) + seconds;
        totalsByProject[project] = (totalsByProject[project] ?? 0) + seconds;
        totalsByAssignee[assignee] = (totalsByAssignee[assignee] ?? 0) + seconds;
      }
    }
  }

  return {
    report: {
      ...report,
      issues: report.issues.map((issue) => restrictToAssignees(issue, assignees)),
      totals_by_category: totalsByCategory,
      totals_by_project: totalsByProject,
      totals_by_assignee: totalsByAssignee,
    },
    matchedIssues: matched.size,
    matches: (issueKey, category) =>
      matched.has(issueKey) && (category === undefined || matchesCategory(category)),
  };
}

export function isFiltered(filters: ReportFilters): boolean {
  return (
    filters.projects.length > 0 ||
    filters.categories.length > 0 ||
    filters.assignees.length > 0 ||
    filters.search !== ''
  );
}

export function filtersLabel(filters: ReportFilters, report: MonthlyReport): string {
  const parts: string[] = [];
  if (filters.projects.length > 0) parts.push(`Proyectos: ${filters.projects.join(', ')}`);
  if (filters.categories.length > 0) {
    parts.push(`Categorías: ${filters.categories.map(categoryLabel).join(', ')}`);
  }
  if (filters.assignees.length > 0) {
    parts.push(
      `Personas: ${filters.assignees.map((key) => assigneeLabel(report, key)).join(', ')}`,
    );
  }
  if (filters.search) parts.push(`Búsqueda: "${filters.search}"`);
  return parts.length > 0 ? parts.join(' · ') : 'Sin filtros';
}
