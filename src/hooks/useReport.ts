// The report hook (shell B). Loads the bundled demo document + runs the engine once, then
// exposes the `Bindings` port to the view. A widget write goes through `sessionBindings` →
// engine `update` → this hook's re-render tick, so a param change recomputes and every bound
// component refreshes. Kept out of App.tsx (Fast-Refresh: components file exports only
// components).

import { useEffect, useMemo, useState } from 'react';
import { buildReportSession, sessionBindings } from '../app/reportSession.ts';
import type { ReportSession } from '../app/reportSession.ts';
import type { Bindings } from '../report/render/bindings.ts';

export type ReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; session: ReportSession; bindings: Bindings };

export function useReport(): ReportState {
  const [session, setSession] = useState<ReportSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    buildReportSession()
      .then((s) => {
        if (alive) setSession(s);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const bindings = useMemo(
    () => (session === null ? null : sessionBindings(session, () => setTick((t) => t + 1))),
    [session],
  );

  if (error !== null) return { status: 'error', message: error };
  if (session === null || bindings === null) return { status: 'loading' };
  return { status: 'ready', session, bindings };
}
