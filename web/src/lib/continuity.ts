import { isBlip, type MonthlyReport } from './report';

export type ContinuityTarget =
  | { kind: 'category'; value: string }
  | { kind: 'status'; value: string };

export interface ContinuitySpan {
  from: number;
  to: number;
  issueKeys: string[];
}

export interface OccupancySpan extends ContinuitySpan {
  count: number;
}

export interface ContinuityGap extends ContinuitySpan {
  beforeIssueKeys: string[];
  afterIssueKeys: string[];
}

export interface ContinuityAnalysis {
  coverage: ContinuitySpan[];
  occupancy: OccupancySpan[];
  gaps: ContinuityGap[];
  observed: ContinuitySpan[];
  coveredSeconds: number;
  observedSeconds: number;
  coverageRatio: number;
  maxConcurrent: number;
}

interface SourceSpan {
  from: number;
  to: number;
  issueKey: string;
}

const unique = (values: Iterable<string>): string[] => [...new Set(values)].sort();

function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from < b.to && b.from < a.to;
}

function clip(
  span: { from: number; to: number },
  range: { from: number; to: number },
): { from: number; to: number } | null {
  const from = Math.max(span.from, range.from);
  const to = Math.min(span.to, range.to);
  return to > from ? { from, to } : null;
}

function mergeCoverage(spans: readonly SourceSpan[]): ContinuitySpan[] {
  const sorted = [...spans].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: ContinuitySpan[] = [];

  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && span.from <= previous.to) {
      previous.to = Math.max(previous.to, span.to);
      previous.issueKeys = unique([...previous.issueKeys, span.issueKey]);
    } else {
      merged.push({ from: span.from, to: span.to, issueKeys: [span.issueKey] });
    }
  }

  return merged;
}

function observedWindows(report: MonthlyReport): ContinuitySpan[] {
  const reportEnd = Date.parse(report.to);
  const generatedAt = Date.parse(report.generated_at);
  const horizon = Math.min(reportEnd, generatedAt);

  return report.work_intervals
    .map((interval) => ({
      from: Date.parse(interval.from),
      to: Math.min(Date.parse(interval.to), horizon),
      issueKeys: [],
    }))
    .filter((span) => span.to > span.from);
}

function assignmentWindows(
  report: MonthlyReport,
  issue: MonthlyReport['issues'][number],
  assignees: ReadonlySet<string>,
): { from: number; to: number }[] {
  if (assignees.size === 0) return [{ from: Date.parse(report.from), to: Date.parse(report.to) }];

  const generatedAt = Date.parse(report.generated_at);
  return issue.assignments
    .filter((assignment) => assignees.has(assignment.assignee))
    .map((assignment) => ({
      from: Date.parse(assignment.from),
      to: assignment.to ? Date.parse(assignment.to) : generatedAt,
    }));
}

function collectSourceSpans(
  report: MonthlyReport,
  target: ContinuityTarget,
  includeIssue: (issueKey: string, category: string) => boolean,
  assignees: ReadonlySet<string>,
  observed: readonly ContinuitySpan[],
): SourceSpan[] {
  const spans: SourceSpan[] = [];

  for (const issue of report.issues) {
    const assignments = assignmentWindows(report, issue, assignees);

    for (const segment of issue.segments) {
      if (segment.terminal || isBlip(segment)) continue;
      if (target.kind === 'category' && segment.category !== target.value) continue;
      if (target.kind === 'status' && segment.status_name !== target.value) continue;
      if (!includeIssue(issue.issue_key, segment.category)) continue;

      for (const interval of segment.work_intervals) {
        const raw = { from: Date.parse(interval.from), to: Date.parse(interval.to) };
        for (const work of observed) {
          const inWork = clip(raw, work);
          if (!inWork) continue;
          for (const assignment of assignments) {
            const selected = clip(inWork, assignment);
            if (selected) spans.push({ ...selected, issueKey: issue.issue_key });
          }
        }
      }
    }
  }

  return spans;
}

function buildOccupancy(
  source: readonly SourceSpan[],
  observed: readonly ContinuitySpan[],
): OccupancySpan[] {
  const result: OccupancySpan[] = [];

  for (const work of observed) {
    const relevant = source.filter((span) => overlaps(span, work));
    const points = unique(
      relevant.flatMap((span) => [
        String(Math.max(work.from, span.from)),
        String(Math.min(work.to, span.to)),
      ]),
    )
      .map(Number)
      .sort((a, b) => a - b);

    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      if (from === undefined || to === undefined || to <= from) continue;
      const active = unique(
        relevant.filter((span) => span.from < to && span.to > from).map((span) => span.issueKey),
      );
      if (active.length > 0) result.push({ from, to, count: active.length, issueKeys: active });
    }
  }

  return result;
}

function buildGaps(
  coverage: readonly ContinuitySpan[],
  source: readonly SourceSpan[],
  observed: readonly ContinuitySpan[],
): ContinuityGap[] {
  const gaps: ContinuityGap[] = [];

  for (const work of observed) {
    const covered = coverage
      .map((span) => clip(span, work))
      .filter((span): span is { from: number; to: number } => span !== null)
      .sort((a, b) => a.from - b.from);
    let cursor = work.from;

    for (const span of covered) {
      if (span.from > cursor) {
        gaps.push({
          from: cursor,
          to: span.from,
          issueKeys: [],
          beforeIssueKeys: unique(
            source.filter((item) => item.to === cursor).map((item) => item.issueKey),
          ),
          afterIssueKeys: unique(
            source.filter((item) => item.from === span.from).map((item) => item.issueKey),
          ),
        });
      }
      cursor = Math.max(cursor, span.to);
    }

    if (cursor < work.to) {
      gaps.push({
        from: cursor,
        to: work.to,
        issueKeys: [],
        beforeIssueKeys: unique(
          source.filter((item) => item.to === cursor).map((item) => item.issueKey),
        ),
        afterIssueKeys: [],
      });
    }
  }

  return gaps;
}

export function analyzeContinuity(
  report: MonthlyReport,
  target: ContinuityTarget,
  options: {
    includeIssue?: (issueKey: string, category: string) => boolean;
    assignees?: readonly string[];
  } = {},
): ContinuityAnalysis {
  const observed = observedWindows(report);
  const source = collectSourceSpans(
    report,
    target,
    options.includeIssue ?? (() => true),
    new Set(options.assignees ?? []),
    observed,
  );
  const coverage = mergeCoverage(source);
  const occupancy = buildOccupancy(source, observed);
  const gaps = buildGaps(coverage, source, observed);
  const coveredSeconds = Math.round(
    coverage.reduce((total, span) => total + span.to - span.from, 0) / 1000,
  );
  const observedSeconds = Math.round(
    observed.reduce((total, span) => total + span.to - span.from, 0) / 1000,
  );

  return {
    coverage,
    occupancy,
    gaps,
    observed,
    coveredSeconds,
    observedSeconds,
    coverageRatio: observedSeconds > 0 ? coveredSeconds / observedSeconds : 0,
    maxConcurrent: occupancy.reduce((max, span) => Math.max(max, span.count), 0),
  };
}
