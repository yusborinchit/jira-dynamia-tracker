import { Fragment } from 'react';
import { SegmentTooltip } from '@/components/SegmentTooltip';
import { useTooltip } from '@/components/Tooltip';
import {
  buildCompressedAxis,
  type CompressedAxis,
  isOnAxis,
  projectIntervals,
  projectToAxis,
} from '@/lib/axis';
import type { MatchFn } from '@/lib/filters';
import {
  formatDuration,
  type Issue,
  type MonthlyReport,
  type Segment,
  spansOf,
} from '@/lib/report';

const MIN_BAR_PX = 3;
const BLOCK_GAP_PX = 2;
const DIMMED_OPACITY = 0.16;

function DayGrid({ axis }: { axis: CompressedAxis }) {
  return (
    <div className="absolute inset-0">
      {axis.days.map((day, index) => (
        <div
          key={day.key}
          className={`absolute top-0 bottom-0 ${index % 2 === 1 ? 'bg-slate-50/70' : ''}`}
          style={{ left: `${day.startPct}%`, width: `${day.widthPct}%` }}
        >
          <div className="absolute top-0 bottom-0 left-0 w-px bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function SegmentBars({
  report,
  issue,
  segment,
  axis,
  color,
  dimmed,
  onSelect,
}: {
  report: MonthlyReport;
  issue: Issue;
  segment: Segment;
  axis: CompressedAxis;
  color: string;
  dimmed: boolean;
  onSelect?: () => void;
}) {
  const tooltip = useTooltip();
  if (segment.terminal || segment.work_intervals.length === 0) return null;

  const bind = tooltip(
    <SegmentTooltip
      report={report}
      issue={issue}
      statusName={segment.status_name}
      category={segment.category}
      seconds={segment.seconds}
      open={segment.open}
      spans={spansOf(segment.work_intervals)}
    />,
  );

  return (
    <>
      {projectIntervals(segment.work_intervals, axis).map((span) => {
        const classes = [
          'absolute top-1.5 h-4 rounded-sm transition-opacity',
          onSelect ? 'cursor-pointer hover:brightness-110' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const style = {
          opacity: dimmed ? DIMMED_OPACITY : 1,
          left: `${span.left.toFixed(4)}%`,
          marginLeft: `min(0px, calc(${span.width.toFixed(4)}% - ${MIN_BAR_PX + BLOCK_GAP_PX}px))`,
          width: `max(${MIN_BAR_PX}px, calc(${span.width.toFixed(4)}% - ${BLOCK_GAP_PX}px))`,
          background: color,
        };

        const trail =
          segment.open && span.reachesEnd && span.left + span.width < 99.5 ? (
            <div
              className="pointer-events-none absolute top-[13px] border-t-2 border-dashed"
              style={{
                left: `${(span.left + span.width).toFixed(4)}%`,
                width: `${(100 - span.left - span.width).toFixed(4)}%`,
                borderColor: color,
                opacity: dimmed ? DIMMED_OPACITY : 0.55,
              }}
            />
          ) : null;

        return (
          <Fragment key={span.left}>
            {onSelect ? (
              <button
                type="button"
                className={classes}
                style={style}
                onClick={onSelect}
                {...bind}
              />
            ) : (
              <div className={classes} style={style} {...bind} />
            )}
            {trail}
          </Fragment>
        );
      })}
    </>
  );
}

interface GanttProps {
  report: MonthlyReport;
  matches?: MatchFn;
  onSelectIssue?: (issueKey: string) => void;
}

export function Gantt({ report, matches, onSelectIssue }: GanttProps) {
  const axis = buildCompressedAxis(report);
  const generatedAt = Date.parse(report.generated_at);
  const showNow = isOnAxis(generatedAt, axis);
  const nowPct = projectToAxis(generatedAt, axis);

  if (axis.days.length === 0) {
    return <p className="py-12 text-center text-slate-500">El período no tiene días laborales.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="flex items-stretch">
          <div className="w-52 flex-none" />
          <div className="relative h-6 flex-1">
            {axis.days.map((day) => (
              <div
                key={day.key}
                className="absolute flex flex-col items-center justify-end pb-1 text-[9px] leading-tight text-slate-500"
                style={{ left: `${day.startPct}%`, width: `${day.widthPct}%` }}
              >
                <span className="tabular-nums">{day.dayNumber}</span>
                <span className="text-[8px] opacity-70">{day.weekday}</span>
              </div>
            ))}
          </div>
          <div className="w-16 flex-none self-end pb-1 pl-2 text-right text-[9px] tracking-wider text-slate-400 uppercase">
            Total
          </div>
        </div>

        {report.issues.map((issue: Issue) => (
          <div key={issue.issue_key} className="flex items-stretch">
            <div
              className="flex w-52 flex-none flex-col overflow-hidden py-1.5 pr-2.5 transition-opacity"
              style={{ opacity: matches && !matches(issue.issue_key) ? 0.35 : 1 }}
            >
              <button
                type="button"
                className="truncate text-left font-mono text-[11px] font-semibold hover:underline"
                onClick={() => onSelectIssue?.(issue.issue_key)}
              >
                {issue.issue_key}
              </button>
              <span className="truncate text-[11px] text-slate-500" title={issue.summary ?? ''}>
                {issue.summary ?? ''}
              </span>
            </div>
            <div className="relative min-h-7 flex-1 border-l border-slate-300">
              <DayGrid axis={axis} />
              <div className="absolute inset-0">
                {issue.segments.map((segment) => (
                  <SegmentBars
                    key={`${segment.entered_at}-${segment.status_name}`}
                    report={report}
                    issue={issue}
                    segment={segment}
                    axis={axis}
                    color={report.category_colors[segment.category] ?? '#ec4899'}
                    dimmed={matches !== undefined && !matches(issue.issue_key, segment.category)}
                    onSelect={onSelectIssue ? () => onSelectIssue(issue.issue_key) : undefined}
                  />
                ))}
                {showNow && (
                  <div
                    className="absolute top-0 bottom-0 z-10 w-px bg-red-500"
                    style={{ left: `${nowPct.toFixed(4)}%` }}
                  />
                )}
              </div>
            </div>
            <span className="w-16 flex-none pt-1.5 pl-2 text-right font-mono text-[10px] font-medium text-slate-600 tabular-nums">
              {formatDuration(issue.total_seconds)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
