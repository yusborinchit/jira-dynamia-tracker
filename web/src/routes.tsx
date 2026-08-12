import { useQuery } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { z } from 'zod';

import { DayView } from '@/components/DayView';
import { FilterBar } from '@/components/FilterBar';
import { Gantt } from '@/components/Gantt';
import { IssueTable } from '@/components/IssueTable';
import { TimelineLegend } from '@/components/TimelineLegend';
import { TooltipProvider } from '@/components/Tooltip';
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
  categories: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  search: z.string().optional(),
});

const rootRoute = createRootRoute({
  component: () => (
    <TooltipProvider>
      <div className="min-h-screen bg-white text-slate-900">
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
      <span className={`size-1.5 rounded-full ${LIVE_DOT[status]}`} />
      {LIVE_LABEL[status]}
    </span>
  );
}

function Dashboard() {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });

  const date = search.date ?? currentDate();
  const span: Span = search.span ?? 'month';
  const filters = {
    projects: search.projects ?? [],
    categories: search.categories ?? [],
    assignees: search.assignees ?? [],
    search: search.search ?? '',
  };

  const { data, isPending, isError, error, isFetching } = useQuery(reportQuery(date, span));
  const liveStatus = useLiveReports();

  const update = (next: {
    date?: string;
    span?: Span;
    projects?: string[];
    categories?: string[];
    assignees?: string[];
    search?: string;
  }) => {
    navigate({
      search: (previous) => {
        const merged = { ...previous, ...next };
        return {
          date: merged.date ?? date,
          span: merged.span,
          projects: merged.projects?.length ? merged.projects : undefined,
          categories: merged.categories?.length ? merged.categories : undefined,
          assignees: merged.assignees?.length ? merged.assignees : undefined,
          search: merged.search ? merged.search : undefined,
        };
      },
      replace: true,
    });
  };

  const view = data ? applyFilters(data, filters) : undefined;
  const highlight = isFiltered(filters) ? view?.matches : undefined;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-4 border-b-2 border-slate-900 pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Jira Tracker</h1>
          <div className="flex items-center gap-3">
            {isFetching && <span className="text-xs text-slate-400">actualizando…</span>}
            <LiveIndicator status={liveStatus} />
          </div>
        </div>

        <FilterBar
          report={data}
          date={date}
          span={span}
          projects={filters.projects}
          categories={filters.categories}
          assignees={filters.assignees}
          search={filters.search}
          availableProjects={data ? allProjects(data) : []}
          availableCategories={data ? allCategories(data) : []}
          availableAssignees={data ? allAssignees(data) : []}
          categoryTotals={view?.report.totals_by_category}
          assigneeTotals={view?.report.totals_by_assignee}
          onExport={
            view ? () => downloadReportExcel(view.report, filters, view.matches) : undefined
          }
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
                <h2 className="mb-1 text-sm font-semibold tracking-tight">
                  {TIMELINE_TITLE[span]}
                </h2>
                <TimelineLegend report={data} span={span} />
                {view.matchedIssues === 0 && (
                  <p className="pb-2 text-xs text-slate-500">
                    Ningún issue coincide con el filtro; se muestra todo atenuado.
                  </p>
                )}
                {span === 'day' ? (
                  <DayView report={view.report} matches={highlight} />
                ) : (
                  <Gantt
                    report={view.report}
                    matches={highlight}
                    onSelectIssue={(issueKey) => update({ search: issueKey })}
                  />
                )}
              </section>

              <section>
                <h2 className="mb-2 text-sm font-semibold tracking-tight">Detalle por issue</h2>
                <IssueTable report={view.report} matches={highlight} />
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
