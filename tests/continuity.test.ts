import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeContinuity } from '../web/src/lib/continuity.ts';
import type { Issue, MonthlyReport, WorkInterval } from '../web/src/lib/report.ts';

const iso = (hour: number): string => `2026-08-27T${String(hour).padStart(2, '0')}:00:00.000Z`;

function issue(
  key: string,
  intervals: WorkInterval[],
  assignments: Issue['assignments'] = [],
): Issue {
  return {
    issue_key: key,
    project_key: 'APP',
    summary: key,
    current_status_name: 'In Progress',
    current_category: 'development',
    current_assignee_id: null,
    current_assignee_name: null,
    total_seconds: 3_600,
    by_category: { development: 3_600 },
    by_assignee: {},
    assignments,
    segments: [
      {
        status_id: '3',
        status_name: 'In Progress',
        category: 'development',
        entered_at: intervals[0]?.from ?? iso(9),
        left_at: intervals.at(-1)?.to ?? iso(10),
        clipped_from: intervals[0]?.from ?? iso(9),
        clipped_to: intervals.at(-1)?.to ?? iso(10),
        work_intervals: intervals,
        open: false,
        terminal: false,
        seconds: intervals.reduce(
          (total, interval) => total + (Date.parse(interval.to) - Date.parse(interval.from)) / 1000,
          0,
        ),
      },
    ],
  };
}

function report(issues: Issue[], generatedAt = iso(17)): MonthlyReport {
  return {
    span: 'day',
    date: '2026-08-27',
    from: iso(9),
    to: iso(17),
    generated_at: generatedAt,
    issues,
    totals_by_category: {},
    totals_by_project: {},
    totals_by_assignee: {},
    assignee_names: {},
    assignee_avatars: {},
    team_members: [],
    category_colors: { development: '#2563eb' },
    work_schedule: {
      timezone: 'UTC',
      days: [1, 2, 3, 4, 5],
      shifts: ['09:00-12:00', '13:00-17:00'],
    },
    work_intervals: [
      { from: iso(9), to: iso(12) },
      { from: iso(13), to: iso(17) },
    ],
  };
}

test('une cobertura solapada y no convierte el descanso en hueco', () => {
  const data = report([
    issue('APP-1', [{ from: iso(9), to: iso(11) }]),
    issue('APP-2', [
      { from: iso(10), to: iso(12) },
      { from: iso(13), to: iso(14) },
    ]),
  ]);
  const result = analyzeContinuity(data, { kind: 'category', value: 'development' });

  assert.equal(result.coverage.length, 2);
  assert.equal(result.coveredSeconds, 4 * 3_600);
  assert.equal(result.observedSeconds, 7 * 3_600);
  assert.equal(result.maxConcurrent, 2);
  assert.deepEqual(
    result.gaps.map((gap) => [gap.from, gap.to]),
    [[Date.parse(iso(14)), Date.parse(iso(17))]],
  );
});

test('dos issues que se relevan sin demora forman una sola cobertura', () => {
  const data = report([
    issue('APP-1', [{ from: iso(9), to: iso(10) }]),
    issue('APP-2', [{ from: iso(10), to: iso(11) }]),
  ]);
  const result = analyzeContinuity(data, { kind: 'category', value: 'development' });

  assert.deepEqual(
    result.coverage.map((span) => [span.from, span.to, span.issueKeys]),
    [[Date.parse(iso(9)), Date.parse(iso(11)), ['APP-1', 'APP-2']]],
  );
  assert.equal(result.maxConcurrent, 1);
});

test('el filtro de persona recorta el estado por su historial de asignación', () => {
  const data = report([
    issue(
      'APP-1',
      [{ from: iso(9), to: iso(12) }],
      [
        { assignee: 'alice', from: iso(9), to: iso(10) },
        { assignee: 'bob', from: iso(10), to: iso(12) },
      ],
    ),
  ]);
  const result = analyzeContinuity(
    data,
    { kind: 'category', value: 'development' },
    { assignees: ['bob'] },
  );

  assert.deepEqual(
    result.coverage.map((span) => [span.from, span.to]),
    [[Date.parse(iso(10)), Date.parse(iso(12))]],
  );
  assert.equal(result.coveredSeconds, 2 * 3_600);
});

test('no informa como hueco el horario futuro del período actual', () => {
  const data = report([issue('APP-1', [{ from: iso(9), to: iso(10) }])], iso(10));
  const result = analyzeContinuity(data, { kind: 'status', value: 'In Progress' });

  assert.equal(result.observedSeconds, 3_600);
  assert.equal(result.coverageRatio, 1);
  assert.deepEqual(result.gaps, []);
});
