// Suite verdicts for the review surfaces (the workbook panel and the on-pixel inspector
// dock): run the worker-side suites when the workbook recomputes (the report's tick) and
// expose per-subject results. One hook, two surfaces — the verdicts must not be computed
// twice per pass or the two surfaces could disagree.
import { useEffect, useState } from 'react';
import type { AsyncEngine } from '../engine/asyncEngine.ts';
import type { SubjectResult } from '../engine/worker/protocol.ts';

export function useVerdicts(engine: AsyncEngine | null, tick: number): {
  results: Map<string, SubjectResult> | null;
  error: string | null;
} {
  const [results, setResults] = useState<Map<string, SubjectResult> | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      });
    return () => {
      alive = false;
    };
  }, [engine, tick]);

  return { results, error };
}
