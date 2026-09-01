import {
  assigneeLabel,
  categoryLabel,
  currentCategoryOf,
  type Issue,
  type MonthlyReport,
} from '@/lib/report';

export interface ReportFilters {
  projects: string[];
  excludedProjects: string[];
  categories: string[];
  excludedCategories: string[];
  assignees: string[];
  excludedAssignees: string[];
  search: string;
}

export const EMPTY_FILTERS: ReportFilters = {
  projects: [],
  excludedProjects: [],
  categories: [],
  excludedCategories: [],
  assignees: [],
  excludedAssignees: [],
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

function restrictToAssignees(
  issue: Issue,
  assignees: ReadonlySet<string>,
  excludedAssignees: ReadonlySet<string>,
): Issue {
  if (assignees.size === 0 && excludedAssignees.size === 0) return issue;

  const byCategory: Record<string, number> = {};
  let total = 0;

  for (const [assignee, buckets] of Object.entries(issue.by_assignee)) {
    if (excludedAssignees.has(assignee)) continue;
    if (assignees.size > 0 && !assignees.has(assignee)) continue;
    for (const [category, seconds] of Object.entries(buckets)) {
      byCategory[category] = (byCategory[category] ?? 0) + seconds;
      total += seconds;
    }
  }

  return { ...issue, by_category: byCategory, total_seconds: total };
}

export function applyFilters(report: MonthlyReport, filters: ReportFilters): FilteredReport {
  const projects = new Set(filters.projects);
  const excludedProjects = new Set(filters.excludedProjects);
  const categories = new Set(filters.categories);
  const excludedCategories = new Set(filters.excludedCategories);
  const assignees = new Set(filters.assignees);
  const excludedAssignees = new Set(filters.excludedAssignees);

  const matchesCategory = (category: string): boolean =>
    !excludedCategories.has(category) && (categories.size === 0 || categories.has(category));
  const matchesAssignee = (assignee: string): boolean =>
    !excludedAssignees.has(assignee) && (assignees.size === 0 || assignees.has(assignee));
  const hasAssigneeFilter = assignees.size > 0 || excludedAssignees.size > 0;

  const matched = new Set<string>();

  for (const issue of report.issues) {
    const project = issue.project_key || 'unknown';
    if (excludedProjects.has(project)) continue;
    if (projects.size > 0 && !projects.has(project)) continue;
    if (!matchesSearch(issue, filters.search)) continue;
    if (!issue.segments.some((segment) => !segment.terminal && matchesCategory(segment.category))) {
      continue;
    }
    if (hasAssigneeFilter && !Object.keys(issue.by_assignee).some(matchesAssignee)) {
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
      if (!matchesAssignee(assignee)) continue;
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
      issues: hasAssigneeFilter
        ? report.issues.map((issue) => restrictToAssignees(issue, assignees, excludedAssignees))
        : report.issues,
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
    filters.excludedProjects.length > 0 ||
    filters.categories.length > 0 ||
    filters.excludedCategories.length > 0 ||
    filters.assignees.length > 0 ||
    filters.excludedAssignees.length > 0 ||
    filters.search !== ''
  );
}

export function filtersLabel(filters: ReportFilters, report: MonthlyReport): string {
  const parts: string[] = [];
  if (filters.projects.length > 0) parts.push(`Proyectos: ${filters.projects.join(', ')}`);
  if (filters.excludedProjects.length > 0) {
    parts.push(`Proyectos excluidos: ${filters.excludedProjects.join(', ')}`);
  }
  if (filters.categories.length > 0) {
    parts.push(`Categorías: ${filters.categories.map(categoryLabel).join(', ')}`);
  }
  if (filters.excludedCategories.length > 0) {
    parts.push(`Categorías excluidas: ${filters.excludedCategories.map(categoryLabel).join(', ')}`);
  }
  if (filters.assignees.length > 0) {
    parts.push(
      `Personas: ${filters.assignees.map((key) => assigneeLabel(report, key)).join(', ')}`,
    );
  }
  if (filters.excludedAssignees.length > 0) {
    parts.push(
      `Personas excluidas: ${filters.excludedAssignees
        .map((key) => assigneeLabel(report, key))
        .join(', ')}`,
    );
  }
  if (filters.search) parts.push(`Búsqueda: "${filters.search}"`);
  return parts.length > 0 ? parts.join(' · ') : 'Sin filtros';
}
