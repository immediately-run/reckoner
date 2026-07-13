// The report hook (shell B + M2 live feed). Loads the bundled demo document, runs the engine
// once, exposes the `Bindings` port to the view, and — once ready — starts a `FeedRuntime` that
// streams the demo live feed into the engine and re-renders on every settled recompute. A widget
// write and a feed frame both flow to the same re-render tick. Kept out of App.tsx (Fast-Refresh:
// components file exports only components).

import { useEffect, useMemo, useState } from 'react';
import { buildReportSession, sessionBindings } from '../app/reportSession.ts';
import type { ReportSession } from '../app/reportSession.ts';
import { demoLiveConnector, DEMO_FEED_NAME } from '../app/demoFeed.ts';
import { FeedRuntime } from '../feed/index.ts';
import type { Bindings } from '../report/render/bindings.ts';

export type ReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; session: ReportSession; bindings: Bindings };

const scheduleFlush = (fn: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
  else setTimeout(fn, 16);
};

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

  // Start the demo live feed once the session is ready; stop it on unmount.
  useEffect(() => {
    if (session === null) return;
    const runtime = new FeedRuntime([{ name: DEMO_FEED_NAME, connector: demoLiveConnector(), tier: 'live' }], {
      engine: session.engine,
      scheduleFlush,
      onSettled: () => setTick((t) => t + 1),
    });
    runtime.start();
    return () => runtime.stop();
  }, [session]);

  const bindings = useMemo(
    () => (session === null ? null : sessionBindings(session, () => setTick((t) => t + 1))),
    [session],
  );

  if (error !== null) return { status: 'error', message: error };
  if (session === null || bindings === null) return { status: 'loading' };
  return { status: 'ready', session, bindings };
}
