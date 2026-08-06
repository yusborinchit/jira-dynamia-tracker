import { categoryLabel, formatDuration, type MonthlyReport } from '@/lib/report';

function orderedCategories(totals: Record<string, number>): string[] {
  return Object.keys(totals)
    .filter((category) => totals[category])
    .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0));
}

export function Summary({ report, issueCount }: { report: MonthlyReport; issueCount: number }) {
  const total = Object.values(report.totals_by_category).reduce((acc, value) => acc + value, 0);
  const categories = orderedCategories(report.totals_by_category);
  const projectCount = Object.keys(report.totals_by_project).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-8">
        <div>
          <div className="text-xl font-semibold tabular-nums">{formatDuration(total)}</div>
          <div className="text-[11px] tracking-wider text-slate-500 uppercase">Horas hábiles</div>
        </div>
        <div>
          <div className="text-xl font-semibold tabular-nums">{issueCount}</div>
          <div className="text-[11px] tracking-wider text-slate-500 uppercase">Issues</div>
        </div>
        <div>
          <div className="text-xl font-semibold tabular-nums">{projectCount}</div>
          <div className="text-[11px] tracking-wider text-slate-500 uppercase">Proyectos</div>
        </div>
      </div>

      {total > 0 && (
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          {categories.map((category) => (
            <div
              key={category}
              style={{
                width: `${(((report.totals_by_category[category] ?? 0) / total) * 100).toFixed(4)}%`,
                background: report.category_colors[category] ?? '#ec4899',
              }}
              title={`${categoryLabel(category)} · ${formatDuration(report.totals_by_category[category] ?? 0)}`}
            />
          ))}
        </div>
      )}

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {categories.map((category) => {
          const seconds = report.totals_by_category[category] ?? 0;
          const share = total > 0 ? ((seconds / total) * 100).toFixed(1) : '0.0';
          return (
            <li key={category} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: report.category_colors[category] ?? '#ec4899' }}
              />
              <span>{categoryLabel(category)}</span>
              <span className="text-slate-500 tabular-nums">
                {formatDuration(seconds)} · {share}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
