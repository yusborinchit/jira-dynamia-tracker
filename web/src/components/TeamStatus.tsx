import { Avatar } from '@/components/Avatar';
import type { MonthlyReport } from '@/lib/report';

export function TeamStatus({
  report,
  onSelectIssue,
}: {
  report: MonthlyReport;
  onSelectIssue: (issueKey: string) => void;
}) {
  const membersWithoutWork = report.team_members.filter(
    (member) => member.development_issues.length === 0,
  ).length;

  return (
    <section aria-labelledby="team-status-title">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="team-status-title" className="text-sm font-semibold tracking-tight">
            Trabajo actual del equipo
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tareas asignadas que están actualmente en desarrollo.
          </p>
        </div>
        {membersWithoutWork > 0 && (
          <p className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
            {membersWithoutWork}{' '}
            {membersWithoutWork === 1 ? 'integrante sin tarea' : 'integrantes sin tarea'}
          </p>
        )}
      </div>

      {report.team_members.length === 0 ? (
        <div className="border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
          Todavía no hay integrantes registrados.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {report.team_members.map((member) => {
            const idle = member.development_issues.length === 0;
            return (
              <article
                key={member.account_id}
                className={`min-w-0 border p-3 ${
                  idle ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <Avatar report={report} assignee={member.account_id} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <h3 className="truncate text-sm font-semibold text-slate-900">
                        {member.display_name}
                      </h3>
                      <span
                        className={`text-[10px] font-bold tracking-wide uppercase ${
                          idle ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {idle ? 'Sin tarea' : 'En desarrollo'}
                      </span>
                    </div>

                    {idle ? (
                      <p className="mt-2 text-sm font-bold text-red-700">
                        No tiene ninguna tarea en desarrollo
                      </p>
                    ) : (
                      <ul className="mt-1.5 space-y-1">
                        {member.development_issues.map((issue) => (
                          <li key={issue.issue_key} className="min-w-0 text-xs text-slate-700">
                            <button
                              type="button"
                              className="w-full truncate text-left hover:text-slate-950 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                              title={`${issue.issue_key}${issue.summary ? ` · ${issue.summary}` : ''}`}
                              onClick={() => onSelectIssue(issue.issue_key)}
                            >
                              <span className="font-mono font-semibold">{issue.issue_key}</span>
                              {issue.summary ? ` · ${issue.summary}` : ''}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
