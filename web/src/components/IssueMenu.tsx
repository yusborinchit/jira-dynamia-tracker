import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

import { jiraIssueUrl } from '@/lib/jira';
import { moveIssue, transitionsQuery } from '@/lib/transitions';

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

interface MenuState {
  issueKey: string;
  x: number;
  y: number;
}

type OpenMenu = (issueKey: string) => (event: React.MouseEvent) => void;

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

  const open = useCallback<OpenMenu>(
    (issueKey) => (event) => {
      if (opensInBrowser(event)) return;
      event.preventDefault();
      event.stopPropagation();

      const keyboard = event.detail === 0;
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({
        issueKey,
        x: keyboard ? rect.left : event.clientX,
        y: (keyboard ? rect.bottom : event.clientY) + ANCHOR_GAP,
      });
    },
    [],
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
  const transitions = useQuery(transitionsQuery(menu.issueKey));
  const move = useMutation({
    mutationFn: (transitionId: string) => moveIssue(menu.issueKey, transitionId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['transitions', menu.issueKey] });
      onClose();
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
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="font-mono text-[11px] font-semibold text-slate-900">{menu.issueKey}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {transitions.data?.current_status_name
            ? `Ahora en ${transitions.data.current_status_name} · mover a`
            : 'Mover a'}
        </div>
      </div>

      <div className="py-1">
        {transitions.isPending && <p className="px-3 py-1.5 text-slate-400">Cargando columnas…</p>}

        {transitions.isError && (
          <p className="px-3 py-1.5 text-red-600">{transitions.error.message}</p>
        )}

        {transitions.data?.transitions.length === 0 && (
          <p className="px-3 py-1.5 text-slate-400">No hay columnas disponibles.</p>
        )}

        {transitions.data?.transitions.map((transition) => {
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

        {move.isError && <p className="px-3 py-1.5 text-red-600">{move.error.message}</p>}
      </div>

      {(href || onFilterIssue) && (
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
      )}
    </div>
  );
}
