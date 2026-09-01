import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('jira-tracker-theme', theme);
  }, [theme]);

  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle inline-flex h-8 items-center gap-2 border border-slate-300 px-3 text-xs text-slate-600 transition hover:border-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={`Cambiar a modo ${dark ? 'claro' : 'oscuro'}`}
      title={`Cambiar a modo ${dark ? 'claro' : 'oscuro'}`}
    >
      <svg
        aria-hidden="true"
        className="size-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        {dark ? (
          <>
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M12.95 3.05l-1.4 1.4M4.45 11.55l-1.4 1.4" />
          </>
        ) : (
          <path d="M13.5 10.2A5.7 5.7 0 0 1 5.8 2.5 5.7 5.7 0 1 0 13.5 10.2Z" />
        )}
      </svg>
      {dark ? 'Claro' : 'Oscuro'}
    </button>
  );
}
