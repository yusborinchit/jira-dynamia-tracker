import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const CURSOR_OFFSET = 14;
const MAX_WIDTH = 280;
const ESTIMATED_HEIGHT = 140;

interface TooltipState {
  content: ReactNode;
  x: number;
  y: number;
}

const TooltipContext = createContext<((state: TooltipState | null) => void) | null>(null);

export interface TooltipHandlers {
  onMouseEnter: (event: React.MouseEvent) => void;
  onMouseMove: (event: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

export function useTooltip(): (content: ReactNode) => TooltipHandlers {
  const show = useContext(TooltipContext);

  return useCallback(
    (content: ReactNode) => ({
      onMouseEnter: (event) => show?.({ content, x: event.clientX, y: event.clientY }),
      onMouseMove: (event) => show?.({ content, x: event.clientX, y: event.clientY }),
      onMouseLeave: () => show?.(null),
    }),
    [show],
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TooltipState | null>(null);
  const show = useMemo(() => (next: TooltipState | null) => setState(next), []);

  const flipX = state !== null && state.x + CURSOR_OFFSET + MAX_WIDTH > window.innerWidth;
  const flipY = state !== null && state.y + CURSOR_OFFSET + ESTIMATED_HEIGHT > window.innerHeight;

  return (
    <TooltipContext.Provider value={show}>
      {children}
      {state !== null &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 rounded-lg border border-slate-700 bg-slate-900/97 px-3 py-2.5 text-[11px] text-white shadow-xl"
            style={{
              maxWidth: MAX_WIDTH,
              left: state.x + CURSOR_OFFSET,
              top: state.y + CURSOR_OFFSET,
              transform: `translate(${flipX ? 'calc(-100% - 28px)' : '0'}, ${flipY ? 'calc(-100% - 28px)' : '0'})`,
            }}
          >
            {state.content}
          </div>,
          document.body,
        )}
    </TooltipContext.Provider>
  );
}
