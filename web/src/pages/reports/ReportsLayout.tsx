import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Outlet, useRouterState } from '@tanstack/react-router';
import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
} from 'react';

import { FilterBar } from '@/components/FilterBar';
import { TeamStatus } from '@/components/TeamStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { downloadReportExcel } from '@/lib/excel';
import { applyFilters, type FilteredReport, isFiltered, type ReportFilters } from '@/lib/filters';
import {
  allAssignees,
  allCategories,
  allProjects,
  currentDate,
  type MonthlyReport,
  reportQuery,
  type Span,
  shiftDate,
} from '@/lib/report';
import { cn } from '@/lib/utils';
import type { ReportSearch } from '@/routes';

const route = getRouteApi('/_app/_reports');

export type ReportUpdate = Partial<Omit<ReportSearch, 'view'>>;

interface ReportsContextValue {
  data: MonthlyReport;
  view: FilteredReport;
  timelineReport: MonthlyReport;
  filters: ReportFilters;
  highlight: FilteredReport['matches'] | undefined;
  search: ReportSearch;
  span: Span;
  date: string;
  update: (next: ReportUpdate) => void;
}

const ReportsContext = createContext<ReportsContextValue | null>(null);

export function useReports(): ReportsContextValue {
  const value = useContext(ReportsContext);
  if (!value) throw new Error('useReports must be used inside ReportsLayout');
  return value;
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-5 w-48" />
      {SKELETON_ROWS.map((row) => (
        <Skeleton key={row} className="h-7 w-full" />
      ))}
    </div>
  );
}

export function ReportsLayout() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const queryClient = useQueryClient();

  const date = search.date ?? currentDate();
  const span: Span = search.span ?? 'month';
  const filters = useMemo<ReportFilters>(
    () => ({
      projects: search.projects ?? [],
      excludedProjects: search.excludedProjects ?? [],
      categories: search.categories ?? [],
      excludedCategories: search.excludedCategories ?? [],
      assignees: search.assignees ?? [],
      excludedAssignees: search.excludedAssignees ?? [],
      search: search.search ?? '',
    }),
    [
      search.assignees,
      search.categories,
      search.excludedAssignees,
      search.excludedCategories,
      search.excludedProjects,
      search.projects,
      search.search,
    ],
  );
  const deferredFilters = useDeferredValue(filters);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const query = useQuery(reportQuery(date, span));
  const { data, isPending, isError, error, isFetching, isPlaceholderData } = query;

  useEffect(() => {
    for (const delta of [-1, 1]) {
      void queryClient.prefetchQuery(reportQuery(shiftDate(date, span, delta), span));
    }
  }, [date, span, queryClient]);

  const update = useCallback(
    (next: ReportUpdate) => {
      void navigate({
        to: '.',
        search: (previous) => {
          const merged = { ...previous, ...next };
          return {
            date: merged.date ?? date,
            span: merged.span,
            projects: merged.projects?.length ? merged.projects : undefined,
            excludedProjects: merged.excludedProjects?.length ? merged.excludedProjects : undefined,
            categories: merged.categories?.length ? merged.categories : undefined,
            excludedCategories: merged.excludedCategories?.length
              ? merged.excludedCategories
              : undefined,
            assignees: merged.assignees?.length ? merged.assignees : undefined,
            excludedAssignees: merged.excludedAssignees?.length
              ? merged.excludedAssignees
              : undefined,
            search: merged.search ? merged.search : undefined,
            focus: merged.focus ? merged.focus : undefined,
            order: merged.order === 'current_status' ? merged.order : undefined,
          };
        },
        replace: true,
      });
    },
    [date, navigate],
  );

  const view = useMemo(
    () => (data ? applyFilters(data, deferredFilters) : undefined),
    [data, deferredFilters],
  );
  const highlight = isFiltered(deferredFilters) ? view?.matches : undefined;
  const timelineReport = useMemo(() => {
    if (!view || !data) return undefined;
    const base =
      deferredFilters.assignees.length > 0 || deferredFilters.excludedAssignees.length > 0
        ? view.report
        : data;
    if (!isFiltered(deferredFilters)) return base;
    return { ...base, issues: base.issues.filter((issue) => view.matches(issue.issue_key)) };
  }, [data, deferredFilters, view]);

  const context = useMemo<ReportsContextValue | null>(
    () =>
      data && view && timelineReport
        ? {
            data,
            view,
            timelineReport,
            filters: deferredFilters,
            highlight,
            search,
            span,
            date,
            update,
          }
        : null,
    [data, view, timelineReport, deferredFilters, highlight, search, span, date, update],
  );

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-border pb-4">
        {data && <TeamStatus report={data} />}

        <FilterBar
          report={data}
          date={date}
          span={span}
          projects={filters.projects}
          excludedProjects={filters.excludedProjects}
          categories={filters.categories}
          excludedCategories={filters.excludedCategories}
          assignees={filters.assignees}
          excludedAssignees={filters.excludedAssignees}
          search={filters.search}
          availableProjects={data ? allProjects(data) : []}
          availableCategories={data ? allCategories(data) : []}
          availableAssignees={data ? allAssignees(data) : []}
          categoryTotals={view?.report.totals_by_category}
          assigneeTotals={view?.report.totals_by_assignee}
          loading={isFetching}
          showCategories={pathname !== '/continuity'}
          onExport={
            view ? () => downloadReportExcel(view.report, deferredFilters, view.matches) : undefined
          }
          onChange={update}
        />
      </header>

      {isPending && <ReportSkeleton />}

      {isError && !data && (
        <p className="py-16 text-center text-destructive">
          No se pudo cargar el reporte: {errorMessage(error)}
        </p>
      )}

      {context && (
        <ReportsContext.Provider value={context}>
          <div
            className={cn(
              'flex flex-col gap-6 transition-opacity',
              isPlaceholderData && 'pointer-events-none opacity-50',
            )}
            aria-busy={isPlaceholderData}
          >
            {context.view.report.issues.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">
                No hay actividad registrada en este período.
              </p>
            ) : (
              <Outlet />
            )}

            <footer className="border-t border-border pt-3 text-[11px] text-muted-foreground">
              Solo se cuenta el tiempo dentro del horario laboral:{' '}
              {data?.work_schedule.shifts.join(' y ')} ({data?.work_schedule.timezone}), sin
              feriados.
            </footer>
          </div>
        </ReportsContext.Provider>
      )}
    </div>
  );
}
