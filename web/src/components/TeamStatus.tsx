import { Avatar } from '@/components/Avatar';
import type { MonthlyReport } from '@/lib/report';

export function TeamStatus({
  report,
  onSelectIssue,
}: {
  report: MonthlyReport;
  onSelectIssue: (issueKey: string) => void;
}) {
  const activeMembers = report.team_members.filter(
    (member) => member.development_issues.length > 0,
  );
  const activeTasks = activeMembers.reduce(
    (total, member) => total + member.development_issues.length,
    0,
  );

  return (
    <section aria-labelledby="team-status-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <h2 id="team-status-title" className="text-sm font-semibold tracking-tight">
            Trabajo actual del equipo
          </h2>
          {activeTasks > 0 && (
            <span className="text-[11px] font-medium text-slate-400">
              {activeTasks} {activeTasks === 1 ? 'tarea en progreso' : 'tareas en progreso'}
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-400">Estado actual · Desarrollo</span>
      </div>

      {activeMembers.length === 0 ? (
        <div className="border-y border-slate-200 py-4 text-center">
          <p className="text-sm font-medium text-slate-600">Nadie tiene tareas en progreso</p>
          <p className="mt-1 text-xs text-slate-400">
            Cuando se asigne una tarea en desarrollo, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {activeMembers.map((member) => (
            <div
              key={member.account_id}
              className="flex min-h-14 min-w-0 border-l-2 border-emerald-500"
            >
              <Avatar report={report} assignee={member.account_id} size={56} />
              <div className="min-w-0 py-1 pl-3">
                <h3 className="truncate text-sm font-semibold text-slate-800">
                  {member.display_name}
                </h3>
                <ul className="mt-1.5 space-y-0.5">
                  {member.development_issues.map((issue) => (
                    <li key={issue.issue_key} className="min-w-0 text-xs text-slate-600">
                      <button
                        type="button"
                        className="w-full truncate text-left hover:text-slate-950 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                        title={`${issue.issue_key}${issue.summary ? ` · ${issue.summary}` : ''}`}
                        onClick={() => onSelectIssue(issue.issue_key)}
                      >
                        <span className="font-mono font-semibold text-slate-700">
                          {issue.issue_key}
                        </span>
                        {issue.summary ? ` · ${issue.summary}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
