import { categoryLabel, currentCategoryOf, type Issue, type MonthlyReport } from '@/lib/report';

export interface ReportFilters {
  projects: string[];
  categories: string[];
  search: string;
}

export const EMPTY_FILTERS: ReportFilters = { projects: [], categories: [], search: '' };

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
    categoryLabel(currentCategoryOf(issue)).toLowerCase().includes(needle)
  );
}

export function applyFilters(report: MonthlyReport, filters: ReportFilters): FilteredReport {
  const projects = new Set(filters.projects);
  const categories = new Set(filters.categories);

  const matchesCategory = (category: string): boolean =>
    categories.size === 0 || categories.has(category);

  const matched = new Set<string>();

  for (const issue of report.issues) {
    if (projects.size > 0 && !projects.has(issue.project_key || 'unknown')) continue;
    if (!matchesSearch(issue, filters.search)) continue;
    if (!issue.segments.some((segment) => !segment.terminal && matchesCategory(segment.category))) {
      continue;
    }
    matched.add(issue.issue_key);
  }

  const totalsByCategory: Record<string, number> = {};
  const totalsByProject: Record<string, number> = {};

  for (const issue of report.issues) {
    if (!matched.has(issue.issue_key)) continue;
    const project = issue.project_key || 'unknown';

    for (const [category, seconds] of Object.entries(issue.by_category)) {
      if (!matchesCategory(category)) continue;
      totalsByCategory[category] = (totalsByCategory[category] ?? 0) + seconds;
      totalsByProject[project] = (totalsByProject[project] ?? 0) + seconds;
    }
  }

  return {
    report: {
      ...report,
      totals_by_category: totalsByCategory,
      totals_by_project: totalsByProject,
    },
    matchedIssues: matched.size,
    matches: (issueKey, category) =>
      matched.has(issueKey) && (category === undefined || matchesCategory(category)),
  };
}

export function isFiltered(filters: ReportFilters): boolean {
  return filters.projects.length > 0 || filters.categories.length > 0 || filters.search !== '';
}
