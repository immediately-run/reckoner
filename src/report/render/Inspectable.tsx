// The on-pixel inspection affordance (V3): "a quiet affordance on every bound element —
// hover-reveal desktop, long-press touch — faint enough not to tax run mode." This wrapper
// renders its children bare unless the inspection port is provided; with it, a small overlay
// button appears on hover / keyboard focus (desktop) and a ~450ms press opens it directly
// (touch, where there is no hover). One component per file, default export (repo rule).
import { useContext, useRef } from 'react';
import type { ReactNode } from 'react';
import { InspectionContext } from './inspectionContext.ts';

interface InspectableProps {
  /** The bound source (a cell id) the wrapped element displays. */
  source: string;
  children: ReactNode;
}

function Inspectable({ source, children }: InspectableProps) {
  const port = useContext(InspectionContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (port === null || !port.canInspect(source)) return <>{children}</>;

  const cancelPress = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <div
      className="rk-inspectable"
      data-source={source}
      onPointerDown={(e) => {
        // Touch long-press opens directly — there is no hover to reveal into.
        if (e.pointerType === 'touch') {
          cancelPress();
          timer.current = setTimeout(() => port.onInspect(source), 450);
        }
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
    >
      {children}
      <button
        type="button"
        className="rk-inspect-btn"
        aria-label={`Inspect ${source}`}
        onClick={() => port.onInspect(source)}
      >
        ⌕
      </button>
    </div>
  );
}

export default Inspectable;
