// The report hook (shell B + M2 live feed). Loads the bundled demo document, runs the engine
// once, exposes the `Bindings` port to the view, and — once ready — starts a `FeedRuntime` that
// streams the demo live feed into the engine and re-renders on every settled recompute. A widget
// write and a feed frame both flow to the same re-render tick. Kept out of App.tsx (Fast-Refresh:
// components file exports only components).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildReportSession, sessionBindings } from '../app/reportSession.ts';
import type { ReportSession, SeedDocument } from '../app/reportSession.ts';
import type { SandboxMount } from '@immediately-run/sdk';
import type { TaskInput } from '@immediately-run/sdk/tasks';
import { demoLiveConnector, DEMO_FEED_NAME } from '../app/demoFeed.ts';
import { usageFeedSpecs } from '../app/usageFeeds.ts';
import { FeedRuntime } from '../feed/index.ts';
import type { Bindings } from '../report/render/bindings.ts';
import { resolveWorkbookMount } from '../app/dispatch.ts';

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

const scheduleFlush = (fn: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
  else setTimeout(fn, 16);
};

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

  // The resolution the current mount set + task input implies ('' when not dispatched).
  // Honest trigger story: the effect below re-runs on ANY dep identity change, and
  // `mounts` is a fresh array on every host mount event (useMounts copies the set), so
  // an unrelated mount update does rebuild the session. dispatchKey is the SEMANTIC
  // key — it changes only when the workbook appears/changes shape or root — and it
  // carries the task input's arrival: the input lands AFTER the delegation mount (the
  // host's `task-input` delivery is a bounded re-send ladder, site-main R3-754), so
  // the arrival itself must flip the key and trigger the rebuild.
  const dispatchKey = useMemo(() => {
    const r = resolveWorkbookMount(mounts, taskInput);
    return r.ok ? `${r.via}:${r.root}` : '';
  }, [mounts, taskInput]);

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
  }, [seed, mounts, taskInput, dispatchKey, reloadToken]);

  // Start the demo live feed once the session is ready; stop it on unmount — but only
  // for documents that read it (Meridian). Retention covers the demo's 30s windowed
  // input with margin (buffer ≥ longest dependent window, §5.3).
  useEffect(() => {
    if (session === null || seed.demoFeed !== true || dispatchKey !== '') return;
    const runtime = new FeedRuntime(
      [{ name: DEMO_FEED_NAME, connector: demoLiveConnector(), tier: 'live', retention: { keepFor: '2m' } }],
      {
        engine: session.engine,
        scheduleFlush,
        onSettled: () => setTick((t) => t + 1),
      },
    );
    runtime.start();
    return () => runtime.stop();
  }, [session, seed, dispatchKey]);

  // The usage workbook's rollup feeds (R3-349): five polled rollups + the meta feed,
  // fetched browser-direct from the first-party analysis endpoint via the host's
  // `net:fetch`. Same lifecycle as the demo feed; a failed poll keeps the last snapshot
  // and refreshes the meta feed's status row instead of erroring the report.
  useEffect(() => {
    if (session === null || seed.usageFeeds !== true || dispatchKey !== '') return;
    const runtime = new FeedRuntime(usageFeedSpecs(), {
      engine: session.engine,
      scheduleFlush,
      onSettled: () => setTick((t) => t + 1),
    });
    runtime.start();
    return () => runtime.stop();
  }, [session, seed, dispatchKey]);

  const bindings = useMemo(
    () => (session === null ? null : sessionBindings(session, () => setTick((t) => t + 1))),
    [session],
  );

  if (error !== null) return { status: 'error', message: error, reload };
  if (session === null || bindings === null) return { status: 'loading', reload };
  return { status: 'ready', session, bindings, tick, reload };
}
