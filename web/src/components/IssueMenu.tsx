import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { RefreshCwIcon } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { jiraIssueUrl } from '@/lib/jira';
import { type MonthlyReport, UNCATEGORIZED } from '@/lib/report';
import {
  type IssueTransitions,
  issueContext,
  moveIssue,
  refreshTransitions,
  transitionsQuery,
} from '@/lib/transitions';

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;
const PREFETCH_DELAY_MS = 150;

interface MenuState {
  issueKey: string;
  x: number;
  y: number;
}

interface IssueMenuHandlers {
  onClick: (event: React.MouseEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

type OpenMenu = (issueKey: string) => IssueMenuHandlers;

const IssueMenuContext = createContext<OpenMenu | null>(null);

export function useIssueMenu(): OpenMenu {
  const open = useContext(IssueMenuContext);
  if (!open) throw new Error('useIssueMenu must be used inside IssueMenuProvider');
  return open;
}

function opensInBrowser(event: React.MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function IssueMenuProvider({
  children,
  onFilterIssue,
}: {
  children: ReactNode;
  onFilterIssue?: (issueKey: string) => void;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPrefetch = useCallback(() => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  }, []);

  useEffect(() => cancelPrefetch, [cancelPrefetch]);

  const open = useCallback<OpenMenu>(
    (issueKey) => ({
      onClick: (event) => {
        if (opensInBrowser(event)) return;
        event.preventDefault();
        event.stopPropagation();
        cancelPrefetch();

        const keyboard = event.detail === 0;
        const rect = event.currentTarget.getBoundingClientRect();
        setMenu({
          issueKey,
          x: keyboard ? rect.left : event.clientX,
          y: (keyboard ? rect.bottom : event.clientY) + ANCHOR_GAP,
        });
      },
      onPointerEnter: () => {
        cancelPrefetch();
        prefetchTimer.current = setTimeout(() => {
          void queryClient.prefetchQuery(transitionsQuery(issueContext(queryClient, issueKey)));
        }, PREFETCH_DELAY_MS);
      },
      onPointerLeave: cancelPrefetch,
    }),
    [cancelPrefetch, queryClient],
  );

  return (
    <IssueMenuContext.Provider value={open}>
      {children}
      {menu !== null &&
        createPortal(
          <IssueMenuPopover
            key={`${menu.issueKey}-${menu.x}-${menu.y}`}
            menu={menu}
            onClose={close}
            onFilterIssue={onFilterIssue}
          />,
          document.body,
        )}
    </IssueMenuContext.Provider>
  );
}

function IssueMenuPopover({
  menu,
  onClose,
  onFilterIssue,
}: {
  menu: MenuState;
  onClose: () => void;
  onFilterIssue?: (issueKey: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  const queryClient = useQueryClient();
  const [context] = useState(() => issueContext(queryClient, menu.issueKey));
  const cached = useQuery(transitionsQuery(context));
  const refresh = useMutation({
    mutationFn: () => refreshTransitions(queryClient, context),
  });
  const fresh: IssueTransitions | undefined = refresh.data;
  const data = fresh ?? cached.data;
  const loading = cached.isPending && !fresh;
  const loadError = refresh.error ?? (fresh ? null : cached.error);
  const move = useMutation({
    mutationFn: (transitionId: string) => moveIssue(menu.issueKey, transitionId),
    onSuccess: (_result, transitionId) => {
      const transition = data?.transitions.find((item) => item.id === transitionId);
      if (transition) {
        queryClient.setQueriesData<MonthlyReport>({ queryKey: ['report'] }, (report) =>
          report
            ? {
                ...report,
                issues: report.issues.map((issue) =>
                  issue.issue_key === menu.issueKey
                    ? {
                        ...issue,
                        current_status_id: transition.to_status_id,
                        current_status_name: transition.to_status_name,
                        current_category: transition.category ?? UNCATEGORIZED,
                      }
                    : issue,
                ),
              }
            : report,
        );
        toast.success(`${menu.issueKey} → ${transition.to_status_name}`);
      }
      onClose();
    },
    onError: () => {
      refresh.mutate();
    },
  });
  const href = jiraIssueUrl(menu.issueKey);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const place = () => {
      const { width, height } = element.getBoundingClientRect();
      const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
      const fitsBelow = menu.y + height + VIEWPORT_MARGIN <= window.innerHeight;
      setPosition({
        left: Math.max(VIEWPORT_MARGIN, Math.min(menu.x, maxLeft)),
        top: fitsBelow
          ? menu.y
          : Math.max(VIEWPORT_MARGIN, menu.y - height - ANCHOR_GAP * 2 - VIEWPORT_MARGIN),
      });
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, [menu.x, menu.y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Mover ${menu.issueKey}`}
      className="fixed z-50 w-60 border border-slate-300 bg-white text-xs text-slate-700 shadow-xl"
      style={position}
    >
      <div className="relative border-b border-slate-200 py-2 pr-8 pl-3">
        <div className="font-mono text-[11px] font-semibold text-slate-900">{menu.issueKey}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {data?.current_status_name ? `Ahora en ${data.current_status_name} · mover a` : 'Mover a'}
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          title="Volver a pedir las columnas a Jira"
          aria-label="Actualizar columnas desde Jira"
          className="absolute top-2 right-2 cursor-pointer p-1 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-slate-500 disabled:cursor-wait"
        >
          <RefreshCwIcon className={`size-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="py-1">
        {loading && <p className="px-3 py-1.5 text-slate-400">Cargando columnas…</p>}

        {loadError && <p className="px-3 py-1.5 text-red-600">{errorMessage(loadError)}</p>}

        {data?.transitions.length === 0 && (
          <p className="px-3 py-1.5 text-slate-400">No hay columnas disponibles.</p>
        )}

        {data?.transitions.map((transition) => {
          const moving = move.isPending && move.variables === transition.id;
          return (
            <button
              key={transition.id}
              type="button"
              role="menuitem"
              disabled={move.isPending}
              title={transition.name !== transition.to_status_name ? transition.name : undefined}
              onClick={() => move.mutate(transition.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
            >
              <span className="size-2.5 flex-none" style={{ background: transition.color }} />
              <span className="truncate">{transition.to_status_name}</span>
              {moving && <span className="ml-auto text-[11px] text-slate-400">moviendo…</span>}
            </button>
          );
        })}

        {move.isError && (
          <p className="px-3 py-1.5 text-red-600">
            {move.error.message}
            {refresh.isSuccess && ' Actualicé las columnas desde Jira; probá de nuevo.'}
          </p>
        )}
      </div>

      <div className="border-t border-slate-200 py-1">
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            onClick={onClose}
            className="block px-3 py-1.5 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            Abrir en Jira ↗
          </a>
        )}
        <Link
          to="/settings/history/$issueKey"
          params={{ issueKey: menu.issueKey }}
          role="menuitem"
          onClick={onClose}
          className="block px-3 py-1.5 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
        >
          Corregir historial
        </Link>
        {onFilterIssue && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onFilterIssue(menu.issueKey);
              onClose();
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            Filtrar por esta tarea
          </button>
        )}
      </div>
    </div>
  );
}
