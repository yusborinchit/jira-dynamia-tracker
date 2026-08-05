export interface Range {
  from: number;
  to: number;
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function monthRange(month: string): Range {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Mes inválido: ${month} (se espera YYYY-MM)`);

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error(`Mes inválido: ${month}`);

  return {
    from: Date.UTC(year, monthIndex, 1),
    to: Date.UTC(year, monthIndex + 1, 1),
  };
}

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function clipToRange(start: number, end: number, range: Range): { from: number; to: number } | null {
  const from = Math.max(start, range.from);
  const to = Math.min(end, range.to);
  return to > from ? { from, to } : null;
}

export function toIso(value: Date | number | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}
