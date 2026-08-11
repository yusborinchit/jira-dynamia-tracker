import { Avatar } from '@/components/Avatar';
import { ClockIcon, LiveIcon, TagIcon, UsersIcon } from '@/components/icons';
import {
  assigneeLabel,
  assigneesOf,
  categoryColor,
  categoryLabel,
  formatDuration,
  type Issue,
  type MonthlyReport,
  type TimeSpan,
  UNASSIGNED,
} from '@/lib/report';

interface SegmentTooltipProps {
  report: MonthlyReport;
  issue: Issue;
  statusName: string;
  category: string;
  seconds: number;
  open: boolean;
  spans: readonly TimeSpan[];
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-300">
      <span className="text-slate-500">{icon}</span>
      {children}
    </div>
  );
}

export function SegmentTooltip({
  report,
  issue,
  statusName,
  category,
  seconds,
  open,
  spans,
}: SegmentTooltipProps) {
  const found = assigneesOf(report, issue, spans);
  const assignees = found.length > 0 ? found : [{ assignee: UNASSIGNED, seconds }];
  const shared = assignees.length > 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <span className="font-mono text-[11px] font-semibold">{issue.issue_key}</span>
        {issue.summary && (
          <p className="line-clamp-2 text-[11px] leading-snug text-slate-400">{issue.summary}</p>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-slate-700 pt-1.5">
        <Line icon={<TagIcon />}>
          <span
            className="size-2 flex-none rounded-sm"
            style={{ background: categoryColor(report, category) }}
          />
          <span className="text-white">{categoryLabel(category)}</span>
          <span className="truncate text-slate-400">· {statusName}</span>
        </Line>

        <Line icon={<ClockIcon />}>
          <span className="tabular-nums text-white">{formatDuration(seconds)}</span>
          {open && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <LiveIcon /> sigue abierto
            </span>
          )}
        </Line>
      </div>

      <div className="flex flex-col gap-1 border-t border-slate-700 pt-1.5">
        <Line icon={<UsersIcon />}>
          <span className="text-[10px] tracking-wider text-slate-400 uppercase">
            {shared ? 'Asignados' : 'Asignado'}
          </span>
        </Line>

        {assignees.map((entry) => (
          <div key={entry.assignee} className="flex items-center gap-1.5 pl-0.5">
            <Avatar report={report} assignee={entry.assignee} size={16} />
            <span className="truncate">{assigneeLabel(report, entry.assignee)}</span>
            {shared && (
              <span className="ml-auto pl-2 tabular-nums text-slate-400">
                {formatDuration(entry.seconds)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
