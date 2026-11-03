const DATE_TIME = new Intl.DateTimeFormat('es-UY', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const DATE_TIME_SECONDS = new Intl.DateTimeFormat('es-UY', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const DATE_ONLY = new Intl.DateTimeFormat('es-UY', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? DATE_TIME.format(new Date(iso)) : '—';
}

export function formatDateTimeSeconds(iso: string | null | undefined): string {
  return iso ? DATE_TIME_SECONDS.format(new Date(iso)) : '—';
}

export function formatIsoDate(date: string): string {
  return DATE_ONLY.format(new Date(`${date}T00:00:00Z`));
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca';
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return RELATIVE.format(seconds, 'second');
  if (abs < 3_600) return RELATIVE.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3_600), 'hour');
  return RELATIVE.format(Math.round(seconds / 86_400), 'day');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatSpan(fromIso: string, toIso: string | null, now = Date.now()): string {
  const seconds = Math.max(
    0,
    Math.round(((toIso ? Date.parse(toIso) : now) - Date.parse(fromIso)) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}
