// The report hook (shell B). Loads the bundled document, runs the engine once, exposes
// the `Bindings` port to the view, and re-renders on a param write (widget) or a reload.
// R3-768 removed the app-supplied live-feed runtimes (the demo tick and the usage rollups):
// a bundled document is fully frozen, and a *dispatched* workbook's feeds are the
// connector-realm's job (R3-769), never report-view wiring. Kept out of App.tsx
// (Fast-Refresh: components file exports only components).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildReportSession, sessionBindings } from '../app/reportSession.ts';
import type { ReportSession, SeedDocument } from '../app/reportSession.ts';
import type { SandboxMount } from '@immediately-run/sdk';
import type { TaskInput } from '@immediately-run/sdk/tasks';
import type { Bindings } from '../report/render/bindings.ts';

export type ReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; session: ReportSession; bindings: Bindings; tick: number };

export interface ReportReload {
  /** Force a fresh session build (§4.4 of DOCUMENT_NAVIGATOR_SPEC): the session
   *  reads the document once, so after an out-of-band edit (the platform editor,
   *  a write the host landed in the corpus) the rendered report is stale until
   *  the caller reloads. Pure state change — the effect below does the work. */
  reload: () => void;
}

export function useReport(
  seed: SeedDocument,
  mounts: readonly SandboxMount[] = [],
  taskInput?: TaskInput | null,
): ReportState & ReportReload {
  const [session, setSession] = useState<ReportSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // The staleness answer's reload half (DOCUMENT_NAVIGATOR_SPEC §4.4): a counter the
  // session-building effect keys on, so `reload()` re-reads the document through the
  // SAME mount resolution rather than remounting anything.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Honest trigger story: the effect re-runs on ANY dep identity change — `mounts` is
  // a fresh array on every host mount event (useMounts copies the set), and `taskInput`
  // lands AFTER the delegation mount (the host's `task-input` delivery re-sends past
  // the callee's boot, site-main R3-754), so the input's arrival itself flips a dep and
  // triggers the rebuild that carries it. (There was a derived `dispatchKey` memo here
  // until the R3-768 rebase: post-R3-768 its only consumer was this deps array, which
  // already holds the memo's own inputs — mutation-tested redundant, review round 3.)
  useEffect(() => {
    let alive = true;
    buildReportSession(undefined, seed, mounts, taskInput)
      .then((s) => {
        if (alive) setSession(s);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [seed, mounts, taskInput, reloadToken]);

  const bindings = useMemo(
    () => (session === null ? null : sessionBindings(session, () => setTick((t) => t + 1))),
    [session],
  );

  if (error !== null) return { status: 'error', message: error, reload };
  if (session === null || bindings === null) return { status: 'loading', reload };
  return { status: 'ready', session, bindings, tick, reload };
}
