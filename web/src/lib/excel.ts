import type { Border, Fill, Row, Worksheet } from 'exceljs';

import type { MatchFn, ReportFilters } from '@/lib/filters';
import {
  CATEGORY_COLOR_FALLBACK,
  categoryLabel,
  categoryRank,
  currentCategoryOf,
  currentDate,
  type Issue,
  type MonthlyReport,
} from '@/lib/report';

const HIGHLIGHTED_CATEGORY = 'development';

const HEADER_BACKGROUND = 'FF0F172A';
const HEADER_TEXT = 'FFFFFFFF';
const HIGHLIGHT_BACKGROUND = 'FFDBEAFE';
const BANDED_BACKGROUND = 'FFF8FAFC';
const MUTED_TEXT = 'FF64748B';

const HOURS_FORMAT = '0.00" h"';

const PERIOD_FORMAT: Record<string, Intl.DateTimeFormatOptions> = {
  day: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  month: { month: 'long', year: 'numeric' },
};

function argb(color: string): string {
  return `FF${color.replace('#', '').toUpperCase()}`;
}

function solidFill(color: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function topBorder(color: string): Partial<Border> {
  return { style: 'thin', color: { argb: color } };
}

function hours(seconds: number): number {
  return Math.round((seconds / 3_600) * 100) / 100;
}

function categoryColorArgb(report: MonthlyReport, category: string): string {
  return argb(report.category_colors[category] ?? CATEGORY_COLOR_FALLBACK);
}

function periodLabel(report: MonthlyReport): string {
  const options = PERIOD_FORMAT[report.span] ?? PERIOD_FORMAT.month;
  const formatter = new Intl.DateTimeFormat('es-UY', {
    ...options,
    timeZone: report.work_schedule.timezone,
  });
  const label = formatter.format(new Date(report.from));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function filtersLabel(filters: ReportFilters): string {
  const parts: string[] = [];
  if (filters.projects.length > 0) parts.push(`Proyectos: ${filters.projects.join(', ')}`);
  if (filters.categories.length > 0) {
    parts.push(`Categorías: ${filters.categories.map(categoryLabel).join(', ')}`);
  }
  if (filters.search) parts.push(`Búsqueda: "${filters.search}"`);
  return parts.length > 0 ? parts.join(' · ') : 'Sin filtros';
}

function usedCategories(report: MonthlyReport): string[] {
  const seen = new Set<string>();
  for (const issue of report.issues) {
    for (const category of Object.keys(issue.by_category)) seen.add(category);
  }
  return [...seen].sort((a, b) => categoryRank(a) - categoryRank(b));
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const byCategory = categoryRank(currentCategoryOf(a)) - categoryRank(currentCategoryOf(b));
    if (byCategory !== 0) return byCategory;
    return b.total_seconds - a.total_seconds;
  });
}

function addMetaRow(sheet: Worksheet, label: string, value: string): void {
  const row = sheet.addRow([label, value]);
  row.getCell(1).font = { bold: true, size: 9, color: { argb: MUTED_TEXT } };
  row.getCell(2).font = { size: 9, color: { argb: MUTED_TEXT } };
}

function styleHeaderRow(row: Row, report: MonthlyReport, categories: string[]): void {
  row.height = 22;
  row.eachCell((cell, index) => {
    const category = categories[index - FIXED_COLUMNS.length - 1];
    cell.font = { bold: true, size: 10, color: { argb: HEADER_TEXT } };
    cell.fill = solidFill(category ? categoryColorArgb(report, category) : HEADER_BACKGROUND);
    cell.alignment = { vertical: 'middle', horizontal: index > 4 ? 'right' : 'left' };
  });
}

const FIXED_COLUMNS = [
  { header: 'Issue', width: 14 },
  { header: 'Proyecto', width: 12 },
  { header: 'Resumen', width: 60 },
  { header: 'Estado actual', width: 16 },
  { header: 'Total', width: 11 },
];

function buildDetailSheet(
  sheet: Worksheet,
  report: MonthlyReport,
  filters: ReportFilters,
  categories: string[],
): void {
  sheet.columns = [
    ...FIXED_COLUMNS.map((column) => ({ width: column.width })),
    ...categories.map(() => ({ width: 13 })),
  ];

  const title = sheet.addRow(['Jira Tracker · Detalle por issue']);
  title.getCell(1).font = { bold: true, size: 14 };
  title.height = 20;

  addMetaRow(sheet, 'Período', periodLabel(report));
  addMetaRow(sheet, 'Filtros', filtersLabel(filters));
  addMetaRow(
    sheet,
    'Horario laboral',
    `${report.work_schedule.shifts.join(' y ')} (${report.work_schedule.timezone})`,
  );
  addMetaRow(sheet, 'Generado', new Date(report.generated_at).toLocaleString('es-UY'));
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    ...FIXED_COLUMNS.map((column) => column.header),
    ...categories.map(categoryLabel),
  ]);
  styleHeaderRow(headerRow, report, categories);

  const headerRowNumber = headerRow.number;
  const issues = sortIssues(report.issues);

  issues.forEach((issue, index) => {
    const category = currentCategoryOf(issue);
    const highlighted = category === HIGHLIGHTED_CATEGORY;

    const row = sheet.addRow([
      issue.issue_key,
      issue.project_key || '—',
      issue.summary ?? '',
      categoryLabel(category),
      hours(issue.total_seconds),
      ...categories.map((name) =>
        issue.by_category[name] ? hours(issue.by_category[name]) : null,
      ),
    ]);

    row.alignment = { vertical: 'top' };
    row.getCell(1).font = { name: 'Consolas', size: 10 };
    row.getCell(2).font = { name: 'Consolas', size: 10 };
    row.getCell(3).alignment = { vertical: 'top', wrapText: true };

    const statusCell = row.getCell(4);
    statusCell.font = { bold: highlighted, size: 10, color: { argb: HEADER_TEXT } };
    statusCell.fill = solidFill(categoryColorArgb(report, category));
    statusCell.alignment = { vertical: 'top', horizontal: 'left' };
    if (issue.current_status_name) {
      statusCell.note = `Estado en Jira: ${issue.current_status_name}`;
    }

    for (let column = 5; column <= FIXED_COLUMNS.length + categories.length; column += 1) {
      const cell = row.getCell(column);
      cell.numFmt = HOURS_FORMAT;
      cell.alignment = { vertical: 'top', horizontal: 'right' };
    }
    row.getCell(5).font = { bold: true, size: 10 };

    if (highlighted) {
      for (let column = 1; column <= FIXED_COLUMNS.length + categories.length; column += 1) {
        if (column === 4) continue;
        row.getCell(column).fill = solidFill(HIGHLIGHT_BACKGROUND);
      }
    } else if (index % 2 === 1) {
      for (let column = 1; column <= FIXED_COLUMNS.length + categories.length; column += 1) {
        if (column === 4) continue;
        row.getCell(column).fill = solidFill(BANDED_BACKGROUND);
      }
    }
  });

  if (issues.length > 0) {
    const firstDataRow = headerRowNumber + 1;
    const lastDataRow = headerRowNumber + issues.length;

    const totalsRow = sheet.addRow(['Total por categoría', '', '', '', null]);
    for (let column = 6; column <= FIXED_COLUMNS.length + categories.length; column += 1) {
      const letter = sheet.getColumn(column).letter;
      totalsRow.getCell(column).value = {
        formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
      };
      totalsRow.getCell(column).numFmt = HOURS_FORMAT;
      totalsRow.getCell(column).alignment = { horizontal: 'right' };
    }
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10 };
      cell.border = { top: topBorder(HEADER_BACKGROUND) };
    });

    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: lastDataRow, column: FIXED_COLUMNS.length + categories.length },
    };
  }

  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: headerRowNumber }];
}

function fileName(report: MonthlyReport): string {
  const date = report.date || currentDate();
  const suffix = report.span === 'day' ? date : date.slice(0, 7);
  return `jira-tracker-${suffix}.xlsx`;
}

export async function downloadReportExcel(
  source: MonthlyReport,
  filters: ReportFilters,
  matches?: MatchFn,
): Promise<void> {
  const { Workbook } = await import('exceljs');

  const report: MonthlyReport = matches
    ? { ...source, issues: source.issues.filter((issue) => matches(issue.issue_key)) }
    : source;

  const workbook = new Workbook();
  workbook.creator = 'Jira Tracker';
  workbook.created = new Date(report.generated_at);

  const categories = usedCategories(report);

  buildDetailSheet(workbook.addWorksheet('Detalle'), report, filters, categories);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(report);
  link.click();
  URL.revokeObjectURL(url);
}
