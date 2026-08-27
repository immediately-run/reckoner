// Suite verdicts for the review surfaces (the workbook panel and the on-pixel inspector
// dock): run the worker-side suites when the workbook recomputes (the report's tick) and
// expose per-subject results. One hook, two surfaces — the verdicts must not be computed
// twice per pass or the two surfaces could disagree.
import { useEffect, useState } from 'react';
import type { AsyncEngine } from '../engine/asyncEngine.ts';
import type { SubjectResult } from '../engine/worker/protocol.ts';

export function useVerdicts(
  engine: AsyncEngine | null,
  tick: number,
): {
  results: Map<string, SubjectResult> | null;
  error: string | null;
  /** `true` while a run is in flight, so the S4a "run the suite" affordance can say it
   *  is running rather than looking inert on a slow workbook. */
  running: boolean;
  /** Re-run the suites on demand, without waiting for a recompute (S4a, R3-231). It
   *  re-runs the SAME `engine.runTests()` the recompute path runs, so the verdicts it
   *  produces are the verdicts the cards show — the exit criterion is that the two
   *  cannot disagree, and the way to guarantee that is to have only one of them. */
  rerun: () => void;
} {
  const [results, setResults] = useState<Map<string, SubjectResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);

  // `running` is DERIVED, not a third piece of state flipped on at the top of the
  // effect: a `setRunning(true)` in the effect body is a synchronous state write during
  // render's commit (and `react-hooks/set-state-in-effect` rejects it). The run's
  // identity is `(tick, nonce)` — a recompute and a manual re-run both change it — so
  // "is a run in flight" is just "has this key settled yet".
  const runKey = `${tick}:${nonce}`;
  const running = engine !== null && settledKey !== runKey;

  useEffect(() => {
    if (engine === null) return;
    let alive = true;
    engine
      .runTests()
      .then((r) => {
        if (alive) {
          setResults(r);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setSettledKey(runKey);
      });
    return () => {
      alive = false;
    };
  }, [engine, tick, nonce, runKey]);

  return { results, error, running, rerun: () => setNonce((n) => n + 1) };
}
