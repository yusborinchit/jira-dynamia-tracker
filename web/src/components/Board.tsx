import { memo, useMemo } from 'react';

import { Avatar } from '@/components/Avatar';
import { useIssueMenu } from '@/components/IssueMenu';
import { jiraIssueUrl } from '@/lib/jira';
import {
  categoryColor,
  categoryLabel,
  currentCategoryOf,
  type Issue,
  type MonthlyReport,
  UNASSIGNED,
  UNCATEGORIZED,
} from '@/lib/report';

const BOARD_COLUMNS = ['pending', 'waiting_info', 'development', 'testing', 'deploy', 'done'];

interface Column {
  category: string;
  issues: Issue[];
}

function buildColumns(issues: Issue[]): Column[] {
  const byCategory = new Map<string, Issue[]>();
  for (const issue of issues) {
    const category = currentCategoryOf(issue);
    const bucket = byCategory.get(category) ?? [];
    bucket.push(issue);
    byCategory.set(category, bucket);
  }

  const extra = [...byCategory.keys()].filter((category) => !BOARD_COLUMNS.includes(category));
  const order = [...BOARD_COLUMNS.slice(0, -1), ...extra.sort(), 'done'];

  return order.map((category) => ({
    category,
    issues: (byCategory.get(category) ?? []).sort(
      (a, b) =>
        (a.current_status_name ?? '').localeCompare(b.current_status_name ?? '') ||
        a.issue_key.localeCompare(b.issue_key, undefined, { numeric: true }),
    ),
  }));
}

function BoardCard({
  report,
  issue,
  showStatus,
}: {
  report: MonthlyReport;
  issue: Issue;
  showStatus: boolean;
}) {
  const openMenu = useIssueMenu();
  const assignee = issue.current_assignee_id ?? UNASSIGNED;

  return (
    <li>
      <a
        href={jiraIssueUrl(issue.issue_key) ?? undefined}
        target="_blank"
        rel="noreferrer"
        onClick={openMenu(issue.issue_key)}
        className="block cursor-pointer border border-slate-200 bg-white px-2.5 py-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold text-slate-800">
            {issue.issue_key}
          </span>
          {showStatus && issue.current_status_name && (
            <span className="truncate text-[10px] text-slate-400">{issue.current_status_name}</span>
          )}
        </div>
        {issue.summary && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-700">{issue.summary}</p>
        )}
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Avatar report={report} assignee={assignee} size={16} />
          <span className="truncate">{issue.current_assignee_name ?? 'Sin asignar'}</span>
        </div>
      </a>
    </li>
  );
}

export const Board = memo(function Board({ report }: { report: MonthlyReport }) {
  const columns = useMemo(() => buildColumns(report.issues), [report.issues]);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {columns.map((column) => {
          if (column.category === UNCATEGORIZED && column.issues.length === 0) return null;
          const statuses = new Set(column.issues.map((issue) => issue.current_status_name));

          return (
            <section
              key={column.category}
              aria-label={categoryLabel(column.category)}
              className="flex w-64 flex-none flex-col bg-slate-50"
            >
              <header
                className="flex items-baseline justify-between border-t-2 px-2.5 py-2"
                style={{ borderColor: categoryColor(report, column.category) }}
              >
                <h3 className="text-xs font-semibold text-slate-800">
                  {categoryLabel(column.category)}
                </h3>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {column.issues.length}
                </span>
              </header>
              {column.issues.length === 0 ? (
                <p className="px-2.5 pb-3 text-[11px] text-slate-400">Sin tareas</p>
              ) : (
                <ul className="flex flex-col gap-1.5 px-1.5 pb-1.5">
                  {column.issues.map((issue) => (
                    <BoardCard
                      key={issue.issue_key}
                      report={report}
                      issue={issue}
                      showStatus={statuses.size > 1}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
});
