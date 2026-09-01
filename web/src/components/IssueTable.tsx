import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { memo, useMemo, useState } from 'react';

import { Avatar } from '@/components/Avatar';
import type { MatchFn } from '@/lib/filters';
import {
  categoryColor,
  categoryLabel,
  categoryRank,
  currentCategoryOf,
  formatDuration,
  type Issue,
  type MonthlyReport,
  UNASSIGNED,
} from '@/lib/report';

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const helper = createColumnHelper<typeof features, Issue>();

const EMPTY_ISSUES: Issue[] = [];

const HIGHLIGHTED_CATEGORY = 'development';

function StatusChip({ issue, report }: { issue: Issue; report: MonthlyReport }) {
  const category = currentCategoryOf(issue);
  const highlighted = category === HIGHLIGHTED_CATEGORY;

  return (
    <span
      title={issue.current_status_name ?? undefined}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
        highlighted ? 'font-semibold text-slate-900' : 'text-slate-700'
      }`}
    >
      <span
        className="size-2.5 flex-none rounded-none"
        style={{ background: categoryColor(report, category) }}
      />
      {categoryLabel(category)}
    </span>
  );
}

function CategoryChips({
  issue,
  colors,
  matches,
}: {
  issue: Issue;
  colors: Record<string, string>;
  matches?: MatchFn;
}) {
  const entries = Object.entries(issue.by_category).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-1">
      {entries.map(([category, seconds]) => (
        <span
          key={category}
          className={`inline-flex items-center gap-1 text-[11px] text-slate-600 ${
            matches && !matches(issue.issue_key, category) ? 'opacity-30' : ''
          }`}
        >
          <span
            className="size-2.5 flex-none rounded-none"
            style={{ background: colors[category] ?? '#ec4899' }}
          />
          {categoryLabel(category)} {formatDuration(seconds)}
        </span>
      ))}
    </div>
  );
}

export const IssueTable = memo(function IssueTable({
  report,
  matches,
}: {
  report: MonthlyReport;
  matches?: MatchFn;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'current_category', desc: false }]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('issue_key', {
          header: 'Issue',
          cell: ({ getValue }) => (
            <span className="font-mono text-[11px] whitespace-nowrap">{getValue()}</span>
          ),
        }),
        helper.accessor('project_key', {
          header: 'Proyecto',
          cell: ({ getValue }) => <span className="font-mono text-[11px]">{getValue()}</span>,
        }),
        helper.accessor((issue) => issue.summary ?? '', {
          id: 'summary',
          header: 'Resumen',
          cell: ({ getValue }) => {
            const value = getValue();
            return value ? (
              <span className="text-slate-700">{value}</span>
            ) : (
              <span className="text-slate-400">—</span>
            );
          },
        }),
        helper.accessor((issue) => issue.current_assignee_name ?? '', {
          id: 'current_assignee',
          header: 'Asignado',
          cell: ({ row, getValue }) => {
            const value = getValue();
            if (!value) return <span className="text-slate-400">—</span>;
            return (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-700">
                <Avatar report={report} assignee={row.original.current_assignee_id ?? UNASSIGNED} />
                {value}
              </span>
            );
          },
        }),
        helper.accessor((issue) => currentCategoryOf(issue), {
          id: 'current_category',
          header: 'Estado actual',
          sortDescFirst: false,
          sortFn: (rowA, rowB) => {
            const byCategory =
              categoryRank(currentCategoryOf(rowA.original)) -
              categoryRank(currentCategoryOf(rowB.original));
            if (byCategory !== 0) return byCategory;
            return rowB.original.total_seconds - rowA.original.total_seconds;
          },
          cell: ({ row }) => <StatusChip issue={row.original} report={report} />,
        }),
        helper.accessor('total_seconds', {
          header: 'Total',
          cell: ({ getValue }) => (
            <span className="tabular-nums whitespace-nowrap">{formatDuration(getValue())}</span>
          ),
        }),
        helper.display({
          id: 'breakdown',
          header: 'Desglose',
          cell: ({ row }) => (
            <CategoryChips issue={row.original} colors={report.category_colors} matches={matches} />
          ),
        }),
      ]),
    [report, matches],
  );

  const table = useTable({
    features,
    columns,
    data: report.issues ?? EMPTY_ISSUES,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const groupedByCategory = sorting[0]?.id === 'current_category';

  if (report.issues.length === 0) {
    return (
      <p className="py-10 text-center text-slate-500">No hay issues que coincidan con el filtro.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sortDirection = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <th
                    key={header.id}
                    className={`border-b border-slate-300 pt-1.5 pr-2 pb-1.5 text-left text-[10px] font-semibold tracking-wider text-slate-500 uppercase ${
                      canSort ? 'cursor-pointer select-none hover:text-slate-800' : ''
                    } ${header.column.id === 'total_seconds' ? 'text-right' : ''}`}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    {sortDirection === 'asc' ? ' ↑' : sortDirection === 'desc' ? ' ↓' : ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, index, rows) => {
            const category = currentCategoryOf(row.original);
            const highlighted = category === HIGHLIGHTED_CATEGORY;
            const previous = rows[index - 1];
            const startsGroup =
              groupedByCategory &&
              previous !== undefined &&
              currentCategoryOf(previous.original) !== category;

            return (
              <tr
                key={row.id}
                className={`${
                  highlighted ? 'bg-blue-50/70 hover:bg-blue-100/60' : 'hover:bg-slate-50'
                } ${matches && !matches(row.original.issue_key) ? 'opacity-30' : ''}`}
              >
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`border-b border-slate-100 pt-1.5 pr-2 pb-1.5 align-top ${
                      startsGroup ? 'border-t-2 border-t-slate-300' : ''
                    } ${cell.column.id === 'total_seconds' ? 'text-right' : ''}`}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
