import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { categoryLabel, formatDuration, type Issue, type MonthlyReport } from '@/lib/report';

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const helper = createColumnHelper<typeof features, Issue>();

const EMPTY_ISSUES: Issue[] = [];

function CategoryChips({ issue, colors }: { issue: Issue; colors: Record<string, string> }) {
  const entries = Object.entries(issue.by_category).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-1">
      {entries.map(([category, seconds]) => (
        <span key={category} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
          <span
            className="size-2.5 flex-none rounded-sm"
            style={{ background: colors[category] ?? '#ec4899' }}
          />
          {categoryLabel(category)} {formatDuration(seconds)}
        </span>
      ))}
    </div>
  );
}

export function IssueTable({ report }: { report: MonthlyReport }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'total_seconds', desc: true }]);

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
        helper.accessor((issue) => issue.current_status_name ?? '', {
          id: 'current_status_name',
          header: 'Estado actual',
          cell: ({ getValue }) => {
            const value = getValue();
            return value ? value : <span className="text-slate-400">—</span>;
          },
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
          cell: ({ row }) => <CategoryChips issue={row.original} colors={report.category_colors} />,
        }),
      ]),
    [report.category_colors],
  );

  const table = useTable({
    features,
    columns,
    data: report.issues ?? EMPTY_ISSUES,
    state: { sorting },
    onSortingChange: setSorting,
  });

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
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`border-b border-slate-100 pt-1.5 pr-2 pb-1.5 align-top ${
                    cell.column.id === 'total_seconds' ? 'text-right' : ''
                  }`}
                >
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
