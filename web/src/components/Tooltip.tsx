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

interface TooltipControls {
  show: (state: TooltipState) => void;
  move: (x: number, y: number) => void;
  hide: () => void;
}

const TooltipContext = createContext<TooltipControls | null>(null);

export interface TooltipHandlers {
  onMouseEnter: (event: React.MouseEvent) => void;
  onMouseMove: (event: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

type TooltipContent = ReactNode | (() => ReactNode);

export function useTooltip(): (content: TooltipContent) => TooltipHandlers {
  const controls = useContext(TooltipContext);

  return useCallback(
    (content: TooltipContent) => ({
      onMouseEnter: (event) =>
        controls?.show({
          content: typeof content === 'function' ? content() : content,
          x: event.clientX,
          y: event.clientY,
        }),
      onMouseMove: (event) => controls?.move(event.clientX, event.clientY),
      onMouseLeave: () => controls?.hide(),
    }),
    [controls],
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TooltipState | null>(null);
  const controls = useMemo<TooltipControls>(
    () => ({
      show: setState,
      move: (x, y) => setState((current) => (current ? { ...current, x, y } : current)),
      hide: () => setState(null),
    }),
    [],
  );

  const flipX = state !== null && state.x + CURSOR_OFFSET + MAX_WIDTH > window.innerWidth;
  const flipY = state !== null && state.y + CURSOR_OFFSET + ESTIMATED_HEIGHT > window.innerHeight;

  return (
    <TooltipContext.Provider value={controls}>
      {children}
      {state !== null &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 rounded-none border border-slate-700 bg-slate-900/97 px-3 py-2.5 text-[11px] text-white shadow-xl"
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
