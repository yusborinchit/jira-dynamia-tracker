import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  ActivityIcon,
  CalendarClockIcon,
  ChartGanttIcon,
  CloudDownloadIcon,
  DatabaseIcon,
  HistoryIcon,
  KanbanIcon,
  LogOutIcon,
  MenuIcon,
  PaletteIcon,
  SearchIcon,
  TagsIcon,
  UsersIcon,
  WebhookIcon,
} from 'lucide-react';
import { type ComponentType, useCallback, useEffect, useState } from 'react';
import { IssueMenuProvider } from '@/components/IssueMenu';
import { CommandMenu } from '@/components/layout/CommandMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { unmappedCountQuery } from '@/lib/admin';
import { logout, sessionQuery } from '@/lib/auth';
import { type LiveStatus, useLiveReports } from '@/lib/live';
import { cn } from '@/lib/utils';

const REPORT_PATHS = new Set(['/', '/continuity', '/board']);

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  keepSearch?: boolean;
}

const REPORT_NAV: NavItem[] = [
  { to: '/', label: 'Línea de tiempo', icon: ChartGanttIcon, keepSearch: true },
  { to: '/continuity', label: 'Continuidad', icon: ActivityIcon, keepSearch: true },
  { to: '/board', label: 'Tablero', icon: KanbanIcon, keepSearch: true },
];

const SETTINGS_NAV: NavItem[] = [
  { to: '/settings/statuses', label: 'Estados', icon: TagsIcon },
  { to: '/settings/categories', label: 'Categorías', icon: PaletteIcon },
  { to: '/settings/schedule', label: 'Horario y feriados', icon: CalendarClockIcon },
  { to: '/settings/people', label: 'Personas', icon: UsersIcon },
  { to: '/settings/history', label: 'Corregir historial', icon: HistoryIcon },
  { to: '/settings/import', label: 'Importar de Jira', icon: CloudDownloadIcon },
  { to: '/settings/webhooks', label: 'Webhooks', icon: WebhookIcon },
  { to: '/settings/system', label: 'Sistema', icon: DatabaseIcon },
];

const LIVE_LABEL: Record<LiveStatus, string> = {
  connecting: 'conectando…',
  live: 'en vivo',
  offline: 'sin conexión',
};

const LIVE_DOT: Record<LiveStatus, string> = {
  connecting: 'bg-amber-400',
  live: 'bg-emerald-500',
  offline: 'bg-slate-400',
};

function NavLink({
  item,
  badge,
  onNavigate,
}: {
  item: NavItem;
  badge?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      search={item.keepSearch ? (previous: Record<string, unknown>) => previous : {}}
      activeOptions={{ exact: item.to === '/', includeSearch: false }}
      onClick={onNavigate}
      className="flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground"
    >
      <Icon className="size-4 flex-none" />
      <span className="truncate">{item.label}</span>
      {badge ? (
        <span className="ml-auto bg-amber-500 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarContents({
  liveStatus,
  onNavigate,
  onSearch,
}: {
  liveStatus: LiveStatus;
  onNavigate?: () => void;
  onSearch: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const unmapped = useQuery(unmappedCountQuery).data?.unmapped ?? 0;

  const signOut = async () => {
    await logout().catch(() => undefined);
    queryClient.setQueryData(sessionQuery.queryKey, { authenticated: false });
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    await navigate({ to: '/login', search: {} });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-baseline justify-between gap-2 px-2.5 pt-1">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Jira Tracker
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn('size-1.5', LIVE_DOT[liveStatus])} />
          {LIVE_LABEL[liveStatus]}
        </span>
      </div>

      <button
        type="button"
        onClick={onSearch}
        className="flex cursor-pointer items-center gap-2 border border-sidebar-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:border-input focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        <SearchIcon className="size-3.5" />
        Buscar
        <kbd className="ml-auto font-mono text-[10px]">Ctrl K</kbd>
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Reportes">
        <span className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Reportes
        </span>
        {REPORT_NAV.map((item) => (
          <NavLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <nav className="flex flex-col gap-0.5" aria-label="Configuración">
        <span className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Configuración
        </span>
        {SETTINGS_NAV.map((item) => (
          <NavLink
            key={item.to}
            item={item}
            badge={item.to === '/settings/statuses' ? unmapped : undefined}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
        <ThemeToggle />
        <button
          type="button"
          onClick={signOut}
          className="flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <LogOutIcon className="size-4" />
          Salir
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const liveStatus = useLiveReports();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const filterIssue = useCallback(
    (issueKey: string) => {
      if (REPORT_PATHS.has(pathname)) {
        void navigate({
          to: '.',
          search: (previous: Record<string, unknown>) => ({ ...previous, search: issueKey }),
          replace: true,
        });
      } else {
        void navigate({ to: '/', search: { search: issueKey } });
      }
    },
    [navigate, pathname],
  );

  const openSearch = () => {
    setMobileOpen(false);
    setCommandOpen(true);
  };

  return (
    <IssueMenuProvider onFilterIssue={filterIssue}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 flex-none overflow-y-auto border-r border-sidebar-border bg-sidebar lg:block">
          <SidebarContents liveStatus={liveStatus} onSearch={openSearch} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent>
            <SheetTitle className="sr-only">Navegación</SheetTitle>
            <SidebarContents
              liveStatus={liveStatus}
              onNavigate={() => setMobileOpen(false)}
              onSearch={openSearch}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Abrir menú"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon />
            </Button>
            <span className="text-sm font-semibold">Jira Tracker</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label="Buscar"
              onClick={openSearch}
            >
              <SearchIcon />
            </Button>
          </header>
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} onFilterIssue={filterIssue} />
    </IssueMenuProvider>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SettingsPage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">{children}</div>;
}
