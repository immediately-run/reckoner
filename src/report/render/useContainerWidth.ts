// Measure a container's own width via `ResizeObserver` for component-level semantic reflow
// (§3.3.1 point 2/3 — a component adapts to *its allotted width*, not the viewport). Returns
// a ref to attach and the measured width; before first measure (and under SSR/static render
// where there is no `ResizeObserver`) it reports the `initial` width so the component renders
// its wide default. Resize is a pure view op — this never touches the engine (resize ≠
// recompute, §3.3.1).

import { useEffect, useRef, useState } from 'react';

export function useContainerWidth(initial = 720): { ref: React.RefObject<HTMLDivElement | null>; width: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

/** Density level for a chart's adaptation ladder (§3.3.1 point 3): wide → medium → narrow. */
export function densityFor(width: number): 'wide' | 'medium' | 'narrow' {
  if (width < 360) return 'narrow';
  if (width < 560) return 'medium';
  return 'wide';
}

/** Like {@link useContainerWidth} but tracks both dimensions (for ShowAbove/ShowBelow height). */
export function useContainerSize(
  initial: { width: number; height: number } = { width: 720, height: 480 },
): { ref: React.RefObject<HTMLDivElement | null>; width: number; height: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 || height > 0) setSize({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width: size.width, height: size.height };
}

/**
 * The device pixel ratio, updated as it changes (zoom, moving between displays), via a
 * `matchMedia` resolution query (§3.3.1 point 4). SSR/static render reports 1.
 */
export function useDpr(): number {
  const [dpr, setDpr] = useState(() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let mql: MediaQueryList | null = null;
    const update = (): void => {
      const next = window.devicePixelRatio || 1;
      setDpr(next);
      // Re-arm at the new ratio so the next change fires (a matchMedia query is a point test).
      mql?.removeEventListener('change', update);
      mql = window.matchMedia(`(resolution: ${next}dppx)`);
      mql.addEventListener('change', update);
    };
    update();
    return () => mql?.removeEventListener('change', update);
  }, []);

  return dpr;
}
