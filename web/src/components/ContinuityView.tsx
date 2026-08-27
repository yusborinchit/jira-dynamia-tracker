import { useMemo, useState } from 'react';

import { useTooltip } from '@/components/Tooltip';
import { buildCompressedAxis, isOnAxis, projectToAxis } from '@/lib/axis';
import { analyzeContinuity, type ContinuityGap, type ContinuityTarget } from '@/lib/continuity';
import type { MatchFn } from '@/lib/filters';
import {
  categoryColor,
  categoryLabel,
  formatDuration,
  isBlip,
  type MonthlyReport,
} from '@/lib/report';

const GAP_OPTIONS = [0, 15, 30, 60] as const;
const CHART_HEIGHT = 132;

function targetKey(target: ContinuityTarget): string {
  return `${target.kind}:${target.value}`;
}

function parseTarget(value: string): ContinuityTarget {
  const separator = value.indexOf(':');
  return {
    kind: value.slice(0, separator) === 'status' ? 'status' : 'category',
    value: value.slice(separator + 1),
  };
}

export function continuityTargets(report: MonthlyReport): ContinuityTarget[] {
  const categories = new Set<string>();
  const statuses = new Set<string>();

  for (const issue of report.issues) {
    for (const segment of issue.segments) {
      if (segment.terminal || segment.work_intervals.length === 0 || isBlip(segment)) continue;
      categories.add(segment.category);
      statuses.add(segment.status_name);
    }
  }

  return [
    ...[...categories].sort().map((value) => ({ kind: 'category' as const, value })),
    ...[...statuses]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ kind: 'status' as const, value })),
  ];
}

export function defaultContinuityTarget(report: MonthlyReport): ContinuityTarget | null {
  const targets = continuityTargets(report);
  return (
    targets.find((target) => target.kind === 'category' && target.value === 'development') ??
    targets[0] ??
    null
  );
}

function formatClock(utcMs: number, timezone: string): string {
  return new Intl.DateTimeFormat('es-UY', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(utcMs));
}

function GapTooltip({ gap, report }: { gap: ContinuityGap; report: MonthlyReport }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-semibold text-red-200">Sin continuidad</span>
      <span className="font-mono text-xs tabular-nums">
        {formatDuration(Math.round((gap.to - gap.from) / 1000))}
      </span>
      <span className="text-slate-300">
        {formatClock(gap.from, report.work_schedule.timezone)} –{' '}
        {formatClock(gap.to, report.work_schedule.timezone)}
      </span>
      {gap.beforeIssueKeys.length > 0 && (
        <span className="text-slate-400">Antes: {gap.beforeIssueKeys.join(', ')}</span>
      )}
      {gap.afterIssueKeys.length > 0 && (
        <span className="text-slate-400">Después: {gap.afterIssueKeys.join(', ')}</span>
      )}
    </div>
  );
}

function AxisLabels({ report }: { report: MonthlyReport }) {
  const axis = buildCompressedAxis(report);

  if (report.span === 'month') {
    return (
      <div className="relative h-7">
        {axis.days.map((day) => (
          <div
            key={day.key}
            className="absolute flex flex-col items-center text-[9px] leading-tight text-slate-500"
            style={{ left: `${day.startPct}%`, width: `${day.widthPct}%` }}
          >
            <span className="font-mono tabular-nums">{day.dayNumber}</span>
            <span className="text-[8px] opacity-70">{day.weekday}</span>
          </div>
        ))}
      </div>
    );
  }

  const timezone = report.work_schedule.timezone;
  const ticks = axis.intervals.flatMap((interval) => {
    const values: number[] = [];
    const first = new Date(interval.from);
    first.setUTCMinutes(0, 0, 0);
    let cursor = first.getTime();
    while (cursor < interval.from) cursor += 3_600_000;
    while (cursor <= interval.to) {
      values.push(cursor);
      cursor += 3_600_000;
    }
    return values;
  });
  const hour = new Intl.DateTimeFormat('es-UY', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  return (
    <div className="relative h-6">
      {ticks.map((tick) => (
        <span
          key={tick}
          className="absolute -translate-x-1/2 font-mono text-[9px] text-slate-400 tabular-nums"
          style={{ left: `${projectToAxis(tick, axis)}%` }}
        >
          {hour.format(new Date(tick))}
        </span>
      ))}
    </div>
  );
}

interface ContinuityViewProps {
  report: MonthlyReport;
  target: ContinuityTarget;
  matches?: MatchFn;
  assignees: string[];
  onTargetChange: (target: ContinuityTarget) => void;
}

export function ContinuityView({
  report,
  target,
  matches,
  assignees,
  onTargetChange,
}: ContinuityViewProps) {
  const tooltip = useTooltip();
  const [minimumGapMinutes, setMinimumGapMinutes] = useState(15);
  const targets = useMemo(() => continuityTargets(report), [report]);
  const analysis = useMemo(
    () =>
      analyzeContinuity(report, target, {
        includeIssue: matches,
        assignees,
      }),
    [assignees, matches, report, target],
  );
  const axis = buildCompressedAxis(report);
  const color =
    target.kind === 'category'
      ? categoryColor(report, target.value)
      : report.issues
            .flatMap((issue) => issue.segments)
            .find((segment) => segment.status_name === target.value)?.category
        ? categoryColor(
            report,
            report.issues
              .flatMap((issue) => issue.segments)
              .find((segment) => segment.status_name === target.value)?.category ?? '',
          )
        : '#2563eb';
  const gaps = analysis.gaps.filter((gap) => gap.to - gap.from >= minimumGapMinutes * 60_000);
  const longestGap = gaps.reduce((max, gap) => Math.max(max, gap.to - gap.from), 0);
  const observedEnd = analysis.observed.at(-1)?.to;
  const generatedAt = Date.parse(report.generated_at);
  const showNow = isOnAxis(generatedAt, axis);

  if (axis.days.length === 0 || !observedEnd) {
    return <p className="py-12 text-center text-slate-500">No hay horario laboral observado.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex min-w-64 flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Qué querés vigilar
          </span>
          <select
            value={targetKey(target)}
            onChange={(event) => onTargetChange(parseTarget(event.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          >
            <optgroup label="Categorías">
              {targets
                .filter((option) => option.kind === 'category')
                .map((option) => (
                  <option key={targetKey(option)} value={targetKey(option)}>
                    {categoryLabel(option.value)}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Estados de Jira">
              {targets
                .filter((option) => option.kind === 'status')
                .map((option) => (
                  <option key={targetKey(option)} value={targetKey(option)}>
                    {option.value}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Mostrar huecos desde
          </span>
          <select
            value={minimumGapMinutes}
            onChange={(event) => setMinimumGapMinutes(Number(event.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          >
            {GAP_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? 'Todos' : `${minutes} min`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
        {[
          ['Cobertura', `${Math.round(analysis.coverageRatio * 100)}%`],
          [`Huecos ≥ ${minimumGapMinutes} min`, String(gaps.length)],
          ['Mayor hueco', longestGap > 0 ? formatDuration(Math.round(longestGap / 1000)) : '—'],
          ['Máximo simultáneo', String(analysis.maxConcurrent)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white px-3 py-3">
            <div className="font-mono text-lg font-semibold tracking-tight tabular-nums">
              {value}
            </div>
            <div className="text-[10px] tracking-wider text-slate-400 uppercase">{label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <AxisLabels report={report} />
          <div className="relative h-5 overflow-hidden rounded-sm bg-slate-100 ring-1 ring-slate-200">
            {analysis.coverage.map((span) => {
              const left = projectToAxis(span.from, axis);
              const right = projectToAxis(span.to, axis);
              return (
                <div
                  key={`coverage-${span.from}`}
                  className="absolute inset-y-0"
                  style={{ left: `${left}%`, width: `${right - left}%`, background: color }}
                  title={`${span.issueKeys.length} issue${span.issueKeys.length === 1 ? '' : 's'}`}
                />
              );
            })}
            {gaps.map((gap) => {
              const left = projectToAxis(gap.from, axis);
              const right = projectToAxis(gap.to, axis);
              return (
                <div
                  key={`gap-${gap.from}`}
                  className="absolute inset-y-0 cursor-help border-x border-red-400"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(0, right - left)}%`,
                    background:
                      'repeating-linear-gradient(135deg, #fee2e2 0, #fee2e2 4px, #fecaca 4px, #fecaca 8px)',
                  }}
                  {...tooltip(<GapTooltip gap={gap} report={report} />)}
                />
              );
            })}
          </div>

          <div
            className="relative mt-2 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
            style={{ height: CHART_HEIGHT }}
          >
            {axis.days.map((day, index) => (
              <div
                key={day.key}
                className={`absolute inset-y-0 border-l border-slate-200 ${index % 2 === 1 ? 'bg-white/60' : ''}`}
                style={{ left: `${day.startPct}%`, width: `${day.widthPct}%` }}
              />
            ))}
            {[1, 2, 3].map((line) => (
              <div
                key={line}
                className="absolute right-0 left-0 border-t border-dashed border-slate-200"
                style={{ bottom: `${line * 25}%` }}
              />
            ))}
            {analysis.occupancy.map((span) => {
              const left = projectToAxis(span.from, axis);
              const right = projectToAxis(span.to, axis);
              const height = (span.count / Math.max(1, analysis.maxConcurrent)) * 100;
              return (
                <div
                  key={`occupancy-${span.from}-${span.to}`}
                  className="absolute bottom-0 min-h-px cursor-help border-t border-white/50 transition-[filter] hover:brightness-95"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(0, right - left)}%`,
                    height: `${height}%`,
                    background: color,
                  }}
                  {...tooltip(
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">
                        {span.count} issue{span.count === 1 ? '' : 's'} simultáneo
                        {span.count === 1 ? '' : 's'}
                      </span>
                      <span className="font-mono text-xs tabular-nums">
                        {formatClock(span.from, report.work_schedule.timezone)} –{' '}
                        {formatClock(span.to, report.work_schedule.timezone)}
                      </span>
                      <span className="text-slate-300">{span.issueKeys.join(', ')}</span>
                    </div>,
                  )}
                />
              );
            })}
            {showNow && (
              <div
                className="absolute inset-y-0 z-20 w-px bg-red-500"
                style={{ left: `${projectToAxis(generatedAt, axis)}%` }}
              />
            )}
            <div className="absolute top-2 left-2 rounded bg-white/85 px-1.5 py-0.5 font-mono text-[9px] text-slate-500 shadow-sm">
              {analysis.maxConcurrent} máx.
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Un hueco aparece cuando ningún issue filtrado permanece en el estado durante horario
        laboral. El área muestra cuántos estuvieron activos al mismo tiempo.
      </p>
    </div>
  );
}
