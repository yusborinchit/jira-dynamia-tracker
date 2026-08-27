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
  active,
  color,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
        active
          ? 'border-slate-800 bg-slate-800 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
      }`}
    >
      {color && <span className="size-2.5 rounded-sm" style={{ background: color }} />}
      {icon}
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
  categories: string[];
  assignees: string[];
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
    categories?: string[];
    assignees?: string[];
    search?: string;
  }) => void;
}

export function FilterBar({
  report,
  date,
  span,
  projects,
  categories,
  assignees,
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

  const toggle = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

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
        <div className="inline-flex rounded-md border border-slate-300 p-0.5">
          {SPANS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ span: option.value })}
              className={`rounded px-2.5 py-1 text-xs transition ${
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
            className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
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
            className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
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
          className="min-w-56 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
        />

        <button
          type="button"
          onClick={exportToExcel}
          disabled={!onExport || isExporting}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              active={projects.includes(project)}
              label={project}
              onClick={() => onChange({ projects: toggle(projects, project) })}
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
            const active = assignees.includes(assignee);
            const seconds = assigneeTotals?.[assignee];
            return (
              <Toggle
                key={assignee}
                active={active}
                icon={<Avatar report={report} assignee={assignee} size={16} />}
                label={assigneeLabel(report, assignee)}
                hint={active && seconds ? formatDuration(seconds) : undefined}
                onClick={() => onChange({ assignees: toggle(assignees, assignee) })}
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
            const active = categories.includes(category);
            const seconds = categoryTotals?.[category];
            return (
              <Toggle
                key={category}
                active={active}
                color={report.category_colors[category] ?? '#ec4899'}
                label={categoryLabel(category)}
                hint={active && seconds ? formatDuration(seconds) : undefined}
                onClick={() => onChange({ categories: toggle(categories, category) })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
