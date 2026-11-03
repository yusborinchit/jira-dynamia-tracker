import { useCallback, useMemo } from 'react';

import {
  ContinuityView,
  continuityTargets,
  defaultContinuityTarget,
} from '@/components/ContinuityView';
import type { ContinuityTarget } from '@/lib/continuity';
import { applyFilters } from '@/lib/filters';
import { useReports } from '@/pages/reports/ReportsLayout';

export function ContinuityPage() {
  const { data, filters, search, update } = useReports();

  const view = useMemo(
    () => applyFilters(data, { ...filters, categories: [], excludedCategories: [] }),
    [data, filters],
  );

  const changeFocus = useCallback(
    (target: ContinuityTarget) => update({ focus: `${target.kind}:${target.value}` }),
    [update],
  );

  const requested: ContinuityTarget | null = search.focus
    ? {
        kind: search.focus.startsWith('status:') ? 'status' : 'category',
        value: search.focus.slice(search.focus.indexOf(':') + 1),
      }
    : null;
  const target =
    requested &&
    continuityTargets(data).some(
      (candidate) => candidate.kind === requested.kind && candidate.value === requested.value,
    )
      ? requested
      : defaultContinuityTarget(data);

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-tight">Continuidad del trabajo</h2>
      {view.matchedIssues === 0 && (
        <p className="pb-2 text-xs text-slate-500">
          Ningún issue coincide con los filtros; no hay continuidad para mostrar.
        </p>
      )}
      {target && (
        <ContinuityView
          report={view.report}
          target={target}
          matches={view.matches}
          assignees={filters.assignees}
          onTargetChange={changeFocus}
        />
      )}
    </section>
  );
}
