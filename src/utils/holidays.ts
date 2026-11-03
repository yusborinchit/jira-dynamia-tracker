export interface HolidayEntry {
  date: string;
  label: string;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function shifted(base: Date, days: number): string {
  return new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function uruguayHolidays(year: number): HolidayEntry[] {
  const easter = easterSunday(year);
  const fixed: [number, number, string][] = [
    [1, 1, 'Año Nuevo'],
    [5, 1, 'Día de los Trabajadores'],
    [7, 18, 'Jura de la Constitución'],
    [8, 25, 'Declaratoria de la Independencia'],
    [12, 25, 'Navidad'],
  ];

  return [
    ...fixed.map(([month, day, name]) => ({
      date: `${year}-${pad(month)}-${pad(day)}`,
      label: name,
    })),
    { date: shifted(easter, -48), label: 'Carnaval' },
    { date: shifted(easter, -47), label: 'Carnaval' },
    ...[-6, -5, -4, -3, -2].map((offset) => ({
      date: shifted(easter, offset),
      label: 'Semana de Turismo',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
