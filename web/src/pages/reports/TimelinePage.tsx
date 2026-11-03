import { DayView } from '@/components/DayView';
import { Gantt } from '@/components/Gantt';
import { IssueTable } from '@/components/IssueTable';
import { TimelineLegend } from '@/components/TimelineLegend';
import { useReports } from '@/pages/reports/ReportsLayout';

export function TimelinePage() {
  const { data, view, timelineReport, highlight, span, search, update } = useReports();
  const issueOrder = search.order ?? 'default';

  return (
    <>
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            {span === 'day' ? 'Cronología del día' : 'Línea de tiempo'}
          </h2>
          {span === 'month' && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Ordenar
              <select
                value={issueOrder}
                onChange={(event) =>
                  update({ order: event.target.value as 'default' | 'current_status' })
                }
                className="border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
              >
                <option value="default">Orden original</option>
                <option value="current_status">Estado actual</option>
              </select>
            </label>
          )}
        </div>
        <TimelineLegend report={data} span={span} />
        {view.matchedIssues === 0 && (
          <p className="pb-2 text-xs text-slate-500">Ningún issue coincide con el filtro.</p>
        )}
        {timelineReport.issues.length > 0 &&
          (span === 'day' ? (
            <DayView report={timelineReport} matches={highlight} />
          ) : (
            <Gantt
              report={timelineReport}
              matches={highlight}
              orderByStatus={issueOrder === 'current_status'}
            />
          ))}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-tight">Detalle por issue</h2>
        {timelineReport.issues.length > 0 && (
          <IssueTable report={timelineReport} matches={highlight} />
        )}
      </section>
    </>
  );
}
