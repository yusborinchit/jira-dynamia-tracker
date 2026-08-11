const BASE = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'flex-none',
} as const;

export function ClockIcon() {
  return (
    <svg {...BASE} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function TagIcon() {
  return (
    <svg {...BASE} aria-hidden="true">
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg {...BASE} aria-hidden="true">
      <path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M18 20v-1a4 4 0 0 0-2.5-3.7" />
      <path d="M15 4.2a3.5 3.5 0 0 1 0 6.6" />
    </svg>
  );
}

export function LiveIcon() {
  return (
    <svg {...BASE} aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}
