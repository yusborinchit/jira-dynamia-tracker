import { type ReactNode, useState } from 'react';

import { Avatar } from '@/components/Avatar';
import {
  assigneeLabel,
  categoryLabel,
  formatDuration,
  type MonthlyReport,
  type Span,
  shiftDate,
} from '@/lib/report';

const SPANS: { value: Span; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'month', label: 'Mes' },
];

const MONTH_FMT = new Intl.DateTimeFormat('es-UY', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

const DAY_FMT = new Intl.DateTimeFormat('es-UY', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function periodLabel(date: string, span: Span): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return capitalize(span === 'month' ? MONTH_FMT.format(utc) : DAY_FMT.format(utc));
}

function Toggle({
  state,
  color,
  icon,
  label,
  hint,
  onClick,
}: {
  state: 'neutral' | 'included' | 'excluded';
  color?: string;
  icon?: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-state={state}
      aria-label={`${label}: ${
        state === 'included' ? 'incluido' : state === 'excluded' ? 'excluido' : 'sin filtrar'
      }`}
      title="Clic para incluir, excluir o limpiar"
      className={`inline-flex items-center gap-1.5 rounded-none border px-2.5 py-1 text-xs transition ${
        state === 'included'
          ? 'border-slate-800 bg-slate-800 text-white'
          : state === 'excluded'
            ? 'border-red-400 bg-white text-red-600'
            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
      }`}
    >
      {color && <span className="size-2.5 rounded-none" style={{ background: color }} />}
      {icon}
      {state === 'excluded' && <span aria-hidden="true">−</span>}
      {label}
      {hint && <span className="tabular-nums opacity-70">{hint}</span>}
    </button>
  );
}

interface FilterBarProps {
  report: MonthlyReport | undefined;
  date: string;
  span: Span;
  projects: string[];
  excludedProjects: string[];
  categories: string[];
  excludedCategories: string[];
  assignees: string[];
  excludedAssignees: string[];
  search: string;
  availableProjects: string[];
  availableCategories: string[];
  availableAssignees: string[];
  categoryTotals: Record<string, number> | undefined;
  assigneeTotals: Record<string, number> | undefined;
  onExport: (() => Promise<void>) | undefined;
  showCategories?: boolean;
  onChange: (next: {
    date?: string;
    span?: Span;
    projects?: string[];
    excludedProjects?: string[];
    categories?: string[];
    excludedCategories?: string[];
    assignees?: string[];
    excludedAssignees?: string[];
    search?: string;
  }) => void;
}

export function FilterBar({
  report,
  date,
  span,
  projects,
  excludedProjects,
  categories,
  excludedCategories,
  assignees,
  excludedAssignees,
  search,
  availableProjects,
  availableCategories,
  availableAssignees,
  categoryTotals,
  assigneeTotals,
  onExport,
  showCategories = true,
  onChange,
}: FilterBarProps) {
  const [isExporting, setIsExporting] = useState(false);

  const cycle = (
    included: string[],
    excluded: string[],
    value: string,
  ): { included: string[]; excluded: string[] } => {
    if (excluded.includes(value)) {
      return {
        included: included.filter((item) => item !== value),
        excluded: excluded.filter((item) => item !== value),
      };
    }
    if (included.includes(value)) {
      return {
        included: included.filter((item) => item !== value),
        excluded: [...excluded, value],
      };
    }
    return { included: [...included, value], excluded };
  };

  const stateOf = (
    included: readonly string[],
    excluded: readonly string[],
    value: string,
  ): 'neutral' | 'included' | 'excluded' => {
    if (excluded.includes(value)) return 'excluded';
    return included.includes(value) ? 'included' : 'neutral';
  };

  const exportToExcel = async () => {
    if (!onExport) return;
    setIsExporting(true);
    try {
      await onExport();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-none border border-slate-300 p-0.5">
          {SPANS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ span: option.value })}
              className={`rounded-none px-2.5 py-1 text-xs transition ${
                span === option.value
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ date: shiftDate(date, span, -1) })}
            className="rounded-none border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="Anterior"
          >
            ←
          </button>
          <span className="min-w-52 text-center text-sm font-medium">
            {periodLabel(date, span)}
          </span>
          <button
            type="button"
            onClick={() => onChange({ date: shiftDate(date, span, 1) })}
            className="rounded-none border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="Siguiente"
          >
            →
          </button>
        </div>

        <input
          type="search"
          value={search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder="Buscar issue, resumen, estado o persona…"
          className="min-w-56 flex-1 rounded-none border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
        />

        <button
          type="button"
          onClick={exportToExcel}
          disabled={!onExport || isExporting}
          className="rounded-none border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? 'Generando…' : 'Descargar Excel'}
        </button>
      </div>

      {availableProjects.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Proyecto
          </span>
          {availableProjects.map((project) => (
            <Toggle
              key={project}
              state={stateOf(projects, excludedProjects, project)}
              label={project}
              onClick={() => {
                const next = cycle(projects, excludedProjects, project);
                onChange({
                  projects: next.included,
                  excludedProjects: next.excluded,
                });
              }}
            />
          ))}
        </div>
      )}

      {availableAssignees.length > 1 && report && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Persona
          </span>
          {availableAssignees.map((assignee) => {
            const state = stateOf(assignees, excludedAssignees, assignee);
            const seconds = assigneeTotals?.[assignee];
            return (
              <Toggle
                key={assignee}
                state={state}
                icon={<Avatar report={report} assignee={assignee} size={16} />}
                label={assigneeLabel(report, assignee)}
                hint={state === 'included' && seconds ? formatDuration(seconds) : undefined}
                onClick={() => {
                  const next = cycle(assignees, excludedAssignees, assignee);
                  onChange({
                    assignees: next.included,
                    excludedAssignees: next.excluded,
                  });
                }}
              />
            );
          })}
        </div>
      )}

      {showCategories && availableCategories.length > 0 && report && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Categoría
          </span>
          {availableCategories.map((category) => {
            const state = stateOf(categories, excludedCategories, category);
            const seconds = categoryTotals?.[category];
            return (
              <Toggle
                key={category}
                state={state}
                color={report.category_colors[category] ?? '#ec4899'}
                label={categoryLabel(category)}
                hint={state === 'included' && seconds ? formatDuration(seconds) : undefined}
                onClick={() => {
                  const next = cycle(categories, excludedCategories, category);
                  onChange({
                    categories: next.included,
                    excludedCategories: next.excluded,
                  });
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
