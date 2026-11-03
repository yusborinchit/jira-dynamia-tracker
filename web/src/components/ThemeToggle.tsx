import { MoonIcon, SunIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'jira-tracker-theme';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const dark = theme === 'dark';
  const Icon = dark ? SunIcon : MoonIcon;

  return (
    <button
      type="button"
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
        className,
      )}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <Icon className="size-4" />
      {dark ? 'Modo claro' : 'Modo oscuro'}
    </button>
  );
}
