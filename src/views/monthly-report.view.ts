import { CATEGORY_COLORS, categoryColor } from '@/db/status-mapping.data';
import type { MonthlyIssue, MonthlyReport, MonthlySegment } from '@/services/report.service';
import { WORK_SHIFTS } from '@/utils/business-hours';
import { dayStartsInRange, formatDuration, REPORT_TIMEZONE, wallClockIn } from '@/utils/time';

const MONTH_TITLE_FMT = new Intl.DateTimeFormat('es-UY', {
  timeZone: REPORT_TIMEZONE,
  month: 'long',
  year: 'numeric',
});

const DATETIME_FMT = new Intl.DateTimeFormat('es-UY', {
  timeZone: REPORT_TIMEZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIMEZONE,
  weekday: 'short',
});

const WEEKDAY_INITIAL: Record<string, string> = {
  Mon: 'L',
  Tue: 'M',
  Wed: 'M',
  Thu: 'J',
  Fri: 'V',
  Sat: 'S',
  Sun: 'D',
};

const TINY_SEGMENT_PCT = 0.2;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

const WORK_SCHEDULE_LABEL = WORK_SHIFTS.map(
  (shift) =>
    `${pad2(shift.startHour)}:${pad2(shift.startMinute)}–${pad2(shift.endHour)}:${pad2(shift.endMinute)}`,
).join(' y ');

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function categoryLabel(category: string): string {
  return capitalizeFirst(category.replace(/_/g, ' '));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isWeekend(utcMs: number): boolean {
  const weekday = WEEKDAY_FMT.format(new Date(utcMs));
  return weekday === 'Sat' || weekday === 'Sun';
}

function orderedCategories(totals: Record<string, number>): string[] {
  const known = Object.keys(CATEGORY_COLORS).filter((category) => totals[category]);
  const extra = Object.keys(totals)
    .filter((category) => !(category in CATEGORY_COLORS))
    .sort();
  return [...known, ...extra];
}

interface Axis {
  from: number;
  to: number;
  span: number;
  days: number[];
}

function pct(value: number, axis: Axis): number {
  return ((value - axis.from) / axis.span) * 100;
}

function renderBar(
  from: number,
  to: number,
  segment: MonthlySegment,
  axis: Axis,
  tooltip: string,
  isLast: boolean,
): string {
  const left = Math.max(0, pct(from, axis));
  const width = Math.max(0, pct(to, axis) - left);
  const tiny = width < TINY_SEGMENT_PCT;

  const classes = [
    'bar',
    segment.terminal ? 'terminal' : '',
    segment.open && isLast ? 'open' : '',
    tiny ? 'tiny' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<div class="${classes}" style="left:${left.toFixed(4)}%;width:${width.toFixed(4)}%;background:${categoryColor(segment.category)}" title="${escapeHtml(tooltip)}"></div>`;
}

function renderSegment(segment: MonthlySegment, axis: Axis): string {
  const duration = segment.terminal ? 'terminal' : formatDuration(segment.seconds);
  const tooltip = `${segment.status_name} · ${segment.category} · ${duration}`;

  if (segment.terminal || segment.work_intervals.length === 0) {
    return renderBar(
      Date.parse(segment.clipped_from),
      Date.parse(segment.clipped_to),
      segment,
      axis,
      tooltip,
      true,
    );
  }

  return segment.work_intervals
    .map((interval, index) =>
      renderBar(
        Date.parse(interval.from),
        Date.parse(interval.to),
        segment,
        axis,
        tooltip,
        index === segment.work_intervals.length - 1,
      ),
    )
    .join('');
}

function renderGridCells(axis: Axis): string {
  return axis.days
    .map((day) => `<div class="day${isWeekend(day) ? ' weekend' : ''}"></div>`)
    .join('');
}

function renderAxisHeader(axis: Axis): string {
  const cells = axis.days
    .map((day) => {
      const wall = wallClockIn(day);
      const weekday = WEEKDAY_INITIAL[WEEKDAY_FMT.format(new Date(day))] ?? '';
      return `<div class="day${isWeekend(day) ? ' weekend' : ''}"><span class="dnum">${wall.day}</span><span class="dwd">${weekday}</span></div>`;
    })
    .join('');

  return `<div class="row axis"><div class="row-label"></div><div class="track"><div class="grid">${cells}</div></div></div>`;
}

function renderNowMarker(axis: Axis, generatedAt: number): string {
  if (generatedAt <= axis.from || generatedAt >= axis.to) return '';
  return `<div class="now" style="left:${pct(generatedAt, axis).toFixed(4)}%"></div>`;
}

function renderIssueRow(issue: MonthlyIssue, axis: Axis, grid: string, now: string): string {
  const bars = issue.segments.map((segment) => renderSegment(segment, axis)).join('');
  const summary = issue.summary ? escapeHtml(issue.summary) : '';

  return `<div class="row">
      <div class="row-label">
        <span class="key">${escapeHtml(issue.issue_key)}</span>
        <span class="summary" title="${summary}">${summary}</span>
      </div>
      <div class="track">
        <div class="grid">${grid}</div>
        <div class="bars">${bars}${now}</div>
        <span class="row-total">${formatDuration(issue.total_seconds)}</span>
      </div>
    </div>`;
}

function renderStackedBar(totals: Record<string, number>, total: number): string {
  if (total <= 0) return '';

  const parts = orderedCategories(totals)
    .map((category) => {
      const share = (totals[category]! / total) * 100;
      const tooltip = `${category} · ${formatDuration(totals[category]!)} · ${share.toFixed(1)}%`;
      return `<div style="width:${share.toFixed(4)}%;background:${categoryColor(category)}" title="${escapeHtml(tooltip)}"></div>`;
    })
    .join('');

  return `<div class="stacked">${parts}</div>`;
}

function renderLegend(totals: Record<string, number>, total: number): string {
  const items = orderedCategories(totals)
    .map((category) => {
      const seconds = totals[category]!;
      const share = total > 0 ? ((seconds / total) * 100).toFixed(1) : '0.0';
      return `<li>
          <span class="swatch" style="background:${categoryColor(category)}"></span>
          <span class="legend-name">${escapeHtml(categoryLabel(category))}</span>
          <span class="legend-value">${formatDuration(seconds)} · ${share}%</span>
        </li>`;
    })
    .join('');

  return `<ul class="legend">${items}</ul>`;
}

function renderDetailTable(issues: MonthlyIssue[]): string {
  const rows = issues
    .map((issue) => {
      const chips = orderedCategories(issue.by_category)
        .map(
          (category) =>
            `<span class="chip"><span class="swatch" style="background:${categoryColor(category)}"></span>${escapeHtml(categoryLabel(category))} ${formatDuration(issue.by_category[category]!)}</span>`,
        )
        .join('');

      return `<tr>
          <td class="mono">${escapeHtml(issue.issue_key)}</td>
          <td>${issue.summary ? escapeHtml(issue.summary) : '<span class="muted">—</span>'}</td>
          <td>${issue.current_status_name ? escapeHtml(issue.current_status_name) : '<span class="muted">—</span>'}</td>
          <td class="num">${formatDuration(issue.total_seconds)}</td>
          <td class="chips">${chips}</td>
        </tr>`;
    })
    .join('');

  return `<table>
      <thead>
        <tr><th>Issue</th><th>Resumen</th><th>Estado actual</th><th class="num">Total</th><th>Desglose</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderProjectTable(totals: Record<string, number>): string {
  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([project, seconds]) =>
        `<tr><td class="mono">${escapeHtml(project)}</td><td class="num">${formatDuration(seconds)}</td></tr>`,
    )
    .join('');

  return `<table class="compact">
      <thead><tr><th>Proyecto</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function renderMonthlyReportHtml(report: MonthlyReport): string {
  const from = Date.parse(report.from);
  const to = Date.parse(report.to);
  const generatedAt = Date.parse(report.generated_at);
  const axis: Axis = {
    from,
    to,
    span: Math.max(1, to - from),
    days: dayStartsInRange({ from, to }),
  };

  const total = Object.values(report.totals_by_category).reduce((acc, value) => acc + value, 0);
  const projectCount = Object.keys(report.totals_by_project).length;
  const monthTitle = capitalizeFirst(MONTH_TITLE_FMT.format(new Date(from)));

  const grid = renderGridCells(axis);
  const nowMarker = renderNowMarker(axis, generatedAt);

  const body = report.issues.length
    ? `<section class="gantt">
        ${renderAxisHeader(axis)}
        ${report.issues.map((issue) => renderIssueRow(issue, axis, grid, nowMarker)).join('')}
      </section>
      <section class="detail">
        <h2>Detalle por issue</h2>
        ${renderDetailTable(report.issues)}
      </section>
      <section class="projects">
        <h2>Totales por proyecto</h2>
        ${renderProjectTable(report.totals_by_project)}
      </section>`
    : `<p class="empty">No hay actividad registrada en este mes.</p>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Reporte ${escapeHtml(report.month)} · jira-tracker</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 24px;
    background: #fff;
    color: #0f172a;
    font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: -0.01em; }
  h2 { margin: 28px 0 10px; font-size: 15px; letter-spacing: -0.01em; }

  header { border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
  .meta { color: #64748b; font-size: 12px; }

  .kpis { display: flex; gap: 32px; margin: 16px 0 10px; }
  .kpi .value { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .kpi .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }

  .stacked { display: flex; height: 12px; border-radius: 6px; overflow: hidden; margin: 12px 0; background: #f1f5f9; }

  .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0 0 8px; padding: 0; font-size: 12px; }
  .legend li { display: flex; align-items: center; gap: 6px; }
  .legend-value { color: #64748b; font-variant-numeric: tabular-nums; }
  .swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; }

  .gantt { margin-top: 18px; }
  .row { display: flex; align-items: stretch; break-inside: avoid; page-break-inside: avoid; }
  .row-label { width: 210px; flex: none; padding: 5px 10px 5px 0; display: flex; flex-direction: column; overflow: hidden; }
  .row-label .key { font: 600 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .row-label .summary { color: #64748b; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .track { position: relative; flex: 1; min-height: 30px; border-left: 1px solid #cbd5e1; }
  .grid { position: absolute; inset: 0; display: flex; }
  .grid .day { flex: 1; border-right: 1px solid #eef2f6; }
  .grid .day.weekend { background: #f8fafc; }
  .bars { position: absolute; inset: 0; }

  .bar {
    position: absolute; top: 8px; height: 14px;
    min-width: 2px; border-radius: 2px;
  }
  .bar.open { border-right: 2px solid #0f172a; }
  .bar.tiny { z-index: 2; box-shadow: 0 0 0 0.5px rgba(255,255,255,0.9); }
  .bar.terminal { top: 13px; height: 4px; opacity: 0.45; border-radius: 2px; }

  .now { position: absolute; top: 0; bottom: 0; width: 1px; background: #ef4444; }

  .row-total {
    position: absolute; right: 4px; top: 7px;
    font: 500 10px/1.4 ui-monospace, monospace; color: #475569;
    background: rgba(255,255,255,0.85); padding: 0 3px; border-radius: 2px;
  }

  .row.axis .track { min-height: 26px; border-left-color: transparent; }
  .row.axis .day { display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
                   border-right: none; font-size: 8px; line-height: 1.2; color: #64748b; padding-bottom: 3px; }
  .row.axis .dnum { font-variant-numeric: tabular-nums; }
  .row.axis .dwd { font-size: 7px; opacity: 0.65; }

  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
       color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 6px 8px 6px 0; font-weight: 600; }
  td { padding: 6px 8px 6px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; white-space: nowrap; }
  .muted { color: #94a3b8; }
  table.compact { width: auto; min-width: 260px; }

  .chips { display: flex; flex-wrap: wrap; gap: 4px 10px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #475569; white-space: nowrap; }

  .empty { color: #64748b; padding: 40px 0; text-align: center; }

  footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 10px; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(monthTitle)}</h1>
  <div class="meta">
    Generado ${escapeHtml(DATETIME_FMT.format(new Date(generatedAt)))} · zona horaria ${escapeHtml(REPORT_TIMEZONE)}
  </div>
  <div class="kpis">
    <div class="kpi"><div class="value">${formatDuration(total)}</div><div class="label">Horas hábiles trackeadas</div></div>
    <div class="kpi"><div class="value">${report.issues.length}</div><div class="label">Issues</div></div>
    <div class="kpi"><div class="value">${projectCount}</div><div class="label">Proyectos</div></div>
  </div>
  ${renderStackedBar(report.totals_by_category, total)}
  ${renderLegend(report.totals_by_category, total)}
</header>

${body}

<footer>
  Solo se cuenta el tiempo dentro del horario laboral: lunes a viernes, ${escapeHtml(WORK_SCHEDULE_LABEL)}.
  Las noches, los fines de semana y la hora de almuerzo no suman.
  Las barras con borde derecho marcado siguen abiertas al momento de generar el reporte.
  Los estados sin categoría asignada aparecen en rosa.
</footer>
</body>
</html>`;
}
