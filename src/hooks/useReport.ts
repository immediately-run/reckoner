// The report hook (shell B + M2 live feed). Loads the bundled demo document, runs the engine
// once, exposes the `Bindings` port to the view, and — once ready — starts a `FeedRuntime` that
// streams the demo live feed into the engine and re-renders on every settled recompute. A widget
// write and a feed frame both flow to the same re-render tick. Kept out of App.tsx (Fast-Refresh:
// components file exports only components).

import { useEffect, useMemo, useState } from 'react';
import { buildReportSession, sessionBindings } from '../app/reportSession.ts';
import type { ReportSession, SeedDocument } from '../app/reportSession.ts';
import type { SandboxMount } from '@immediately-run/sdk';
import { demoLiveConnector, DEMO_FEED_NAME } from '../app/demoFeed.ts';
import { FeedRuntime } from '../feed/index.ts';
import type { Bindings } from '../report/render/bindings.ts';
import { resolveWorkbookMount } from '../app/dispatch.ts';

export type ReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; session: ReportSession; bindings: Bindings; tick: number };

const scheduleFlush = (fn: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
  else setTimeout(fn, 16);
};

export function useReport(seed: SeedDocument, mounts: readonly SandboxMount[] = []): ReportState {
  const [session, setSession] = useState<ReportSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // The resolution the current mount set implies ('' when not dispatched) — the effect
  // key that rebuilds the session ONLY when the workbook appears/changes, never on an
  // unrelated mount update mid-document.
  const dispatchKey = useMemo(() => {
    const r = resolveWorkbookMount(mounts);
    return r.ok ? r.root : '';
  }, [mounts]);

  useEffect(() => {
    let alive = true;
    buildReportSession(undefined, seed, mounts)
      .then((s) => {
        if (alive) setSession(s);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [seed, mounts, dispatchKey]);

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

  const bindings = useMemo(
    () => (session === null ? null : sessionBindings(session, () => setTick((t) => t + 1))),
    [session],
  );

  if (error !== null) return { status: 'error', message: error };
  if (session === null || bindings === null) return { status: 'loading' };
  return { status: 'ready', session, bindings, tick };
}
