import { useQuery } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { useCallback, useDeferredValue, useMemo } from 'react';
import { z } from 'zod';
import {
  ContinuityView,
  continuityTargets,
  defaultContinuityTarget,
} from '@/components/ContinuityView';
import { DayView } from '@/components/DayView';
import { FilterBar } from '@/components/FilterBar';
import { Gantt } from '@/components/Gantt';
import { IssueTable } from '@/components/IssueTable';
import { TeamStatus } from '@/components/TeamStatus';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TimelineLegend } from '@/components/TimelineLegend';
import { TooltipProvider } from '@/components/Tooltip';
import type { ContinuityTarget } from '@/lib/continuity';
import { downloadReportExcel } from '@/lib/excel';
import { applyFilters, isFiltered } from '@/lib/filters';
import { type LiveStatus, useLiveReports } from '@/lib/live';
import {
  allAssignees,
  allCategories,
  allProjects,
  currentDate,
  reportQuery,
  type Span,
} from '@/lib/report';

const searchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  span: z.enum(['day', 'month']).optional(),
  projects: z.array(z.string()).optional(),
  excludedProjects: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  excludedCategories: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  excludedAssignees: z.array(z.string()).optional(),
  search: z.string().optional(),
  view: z.enum(['issues', 'continuity']).optional(),
  focus: z.string().optional(),
});

const rootRoute = createRootRoute({
  component: () => (
    <TooltipProvider>
      <div className="theme-shell min-h-screen bg-white text-slate-900">
        <Outlet />
      </div>
    </TooltipProvider>
  ),
});

const TIMELINE_TITLE: Record<Span, string> = {
  day: 'Cronología del día',
  month: 'Línea de tiempo',
};

const LIVE_LABEL: Record<LiveStatus, string> = {
  connecting: 'conectando…',
  live: 'en vivo',
  offline: 'sin conexión',
};

const LIVE_DOT: Record<LiveStatus, string> = {
  connecting: 'bg-amber-400',
  live: 'bg-emerald-500',
  offline: 'bg-slate-300',
};

function LiveIndicator({ status }: { status: LiveStatus }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400">
      <span className={`size-1.5 rounded-none ${LIVE_DOT[status]}`} />
      {LIVE_LABEL[status]}
    </span>
  );
}

function Dashboard() {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });

  const date = search.date ?? currentDate();
  const span: Span = search.span ?? 'month';
  const filters = useMemo(
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
  const timelineView = search.view ?? 'issues';

  const { data, isPending, isError, error, isFetching } = useQuery(reportQuery(date, span));
  const liveStatus = useLiveReports();

  const update = useCallback(
    (next: {
      date?: string;
      span?: Span;
      projects?: string[];
      excludedProjects?: string[];
      categories?: string[];
      excludedCategories?: string[];
      assignees?: string[];
      excludedAssignees?: string[];
      search?: string;
      view?: 'issues' | 'continuity';
      focus?: string;
    }) => {
      navigate({
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
            view: merged.view === 'continuity' ? merged.view : undefined,
            focus: merged.focus ? merged.focus : undefined,
          };
        },
        replace: true,
      });
    },
    [date, navigate],
  );

  const effectiveFilters = useMemo(
    () =>
      timelineView === 'continuity'
        ? { ...deferredFilters, categories: [], excludedCategories: [] }
        : deferredFilters,
    [deferredFilters, timelineView],
  );
  const view = useMemo(
    () => (data ? applyFilters(data, effectiveFilters) : undefined),
    [data, effectiveFilters],
  );
  const highlight = isFiltered(deferredFilters) ? view?.matches : undefined;
  const timelineReport =
    view && (deferredFilters.assignees.length > 0 || deferredFilters.excludedAssignees.length > 0)
      ? view.report
      : data;
  const selectIssue = useCallback((issueKey: string) => update({ search: issueKey }), [update]);
  const changeFocus = useCallback(
    (target: ContinuityTarget) => update({ focus: `${target.kind}:${target.value}` }),
    [update],
  );
  const fallbackTarget = data ? defaultContinuityTarget(data) : null;
  const requestedTarget: ContinuityTarget | null = search.focus
    ? {
        kind: search.focus.startsWith('status:') ? 'status' : 'category',
        value: search.focus.slice(search.focus.indexOf(':') + 1),
      }
    : null;
  const focusTarget =
    data &&
    requestedTarget &&
    continuityTargets(data).some(
      (target) => target.kind === requestedTarget.kind && target.value === requestedTarget.value,
    )
      ? requestedTarget
      : fallbackTarget;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-4 border-b-2 border-slate-900 pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Jira Tracker</h1>
          <div className="flex items-center gap-3">
            {isFetching && <span className="text-xs text-slate-400">actualizando…</span>}
            <LiveIndicator status={liveStatus} />
            <ThemeToggle />
          </div>
        </div>

        {data && <TeamStatus report={data} onSelectIssue={selectIssue} />}

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
          onExport={
            view ? () => downloadReportExcel(view.report, deferredFilters, view.matches) : undefined
          }
          showCategories={timelineView === 'issues'}
          onChange={update}
        />
      </header>

      {isPending && <p className="py-16 text-center text-slate-500">Cargando…</p>}

      {isError && (
        <p className="py-16 text-center text-red-600">
          No se pudo cargar el reporte: {(error as Error).message}
        </p>
      )}

      {data && view && (
        <>
          {view.report.issues.length === 0 ? (
            <p className="py-16 text-center text-slate-500">
              No hay actividad registrada en este período.
            </p>
          ) : (
            <>
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">
                    {timelineView === 'continuity'
                      ? 'Continuidad del trabajo'
                      : TIMELINE_TITLE[span]}
                  </h2>
                  <fieldset
                    className="inline-flex rounded-none border border-slate-300 p-0.5"
                    aria-label="Vista de cronología"
                  >
                    {(
                      [
                        ['issues', 'Por issue'],
                        ['continuity', 'Continuidad'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => update({ view: value })}
                        className={`rounded-none px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${
                          timelineView === value
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </fieldset>
                </div>
                {timelineView === 'issues' && <TimelineLegend report={data} span={span} />}
                {view.matchedIssues === 0 && (
                  <p className="pb-2 text-xs text-slate-500">
                    {timelineView === 'continuity'
                      ? 'Ningún issue coincide con los filtros; no hay continuidad para mostrar.'
                      : 'Ningún issue coincide con el filtro; se muestra todo atenuado.'}
                  </p>
                )}
                {timelineView === 'continuity' && focusTarget ? (
                  <ContinuityView
                    report={view.report}
                    target={focusTarget}
                    matches={view.matches}
                    assignees={deferredFilters.assignees}
                    onTargetChange={changeFocus}
                  />
                ) : span === 'day' && timelineReport ? (
                  <DayView report={timelineReport} matches={highlight} />
                ) : timelineReport ? (
                  <Gantt report={timelineReport} matches={highlight} onSelectIssue={selectIssue} />
                ) : null}
              </section>

              <section>
                <h2 className="mb-2 text-sm font-semibold tracking-tight">Detalle por issue</h2>
                {timelineReport && <IssueTable report={timelineReport} matches={highlight} />}
              </section>
            </>
          )}

          <footer className="border-t border-slate-200 pt-3 text-[11px] text-slate-400">
            Solo se cuenta el tiempo dentro del horario laboral: lunes a viernes,{' '}
            {data.work_schedule.shifts.join(' y ')} ({data.work_schedule.timezone}).
          </footer>
        </>
      )}
    </div>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: searchSchema,
  component: Dashboard,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
