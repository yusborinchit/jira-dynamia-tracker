import type { Issue, MonthlyReport } from '@/lib/report';

export interface ReportFilters {
  projects: string[];
  categories: string[];
  search: string;
}

export const EMPTY_FILTERS: ReportFilters = { projects: [], categories: [], search: '' };

function matchesSearch(issue: Issue, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return (
    issue.issue_key.toLowerCase().includes(needle) ||
    (issue.summary ?? '').toLowerCase().includes(needle) ||
    (issue.current_status_name ?? '').toLowerCase().includes(needle)
  );
}

export function applyFilters(report: MonthlyReport, filters: ReportFilters): MonthlyReport {
  const projects = new Set(filters.projects);
  const categories = new Set(filters.categories);

  const issues: Issue[] = [];

  for (const issue of report.issues) {
    const project = issue.project_key || 'unknown';
    if (projects.size > 0 && !projects.has(project)) continue;
    if (!matchesSearch(issue, filters.search)) continue;

    const segments =
      categories.size > 0
        ? issue.segments.filter((segment) => categories.has(segment.category))
        : issue.segments;

    const kept = segments.filter((segment) => !segment.terminal);
    if (kept.length === 0) continue;

    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const segment of kept) {
      byCategory[segment.category] = (byCategory[segment.category] ?? 0) + segment.seconds;
      total += segment.seconds;
    }

    issues.push({ ...issue, segments, by_category: byCategory, total_seconds: total });
  }

  const totalsByCategory: Record<string, number> = {};
  const totalsByProject: Record<string, number> = {};

  for (const issue of issues) {
    for (const [category, seconds] of Object.entries(issue.by_category)) {
      totalsByCategory[category] = (totalsByCategory[category] ?? 0) + seconds;
    }
    const project = issue.project_key || 'unknown';
    totalsByProject[project] = (totalsByProject[project] ?? 0) + issue.total_seconds;
  }

  return {
    ...report,
    issues,
    totals_by_category: totalsByCategory,
    totals_by_project: totalsByProject,
  };
}

export function isFiltered(filters: ReportFilters): boolean {
  return filters.projects.length > 0 || filters.categories.length > 0 || filters.search !== '';
}
