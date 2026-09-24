// The report hook (shell B + M2 live feed). Loads the bundled demo document, runs the engine
// once, exposes the `Bindings` port to the view, and — once ready — starts a `FeedRuntime` that
// streams the demo live feed into the engine and re-renders on every settled recompute. A widget
// write and a feed frame both flow to the same re-render tick. Kept out of App.tsx (Fast-Refresh:
// components file exports only components).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildReportSession, sessionBindings } from '../app/reportSession.ts';
import type { ReportSession, SeedDocument } from '../app/reportSession.ts';
import type { SandboxMount } from '@immediately-run/sdk';
import { demoLiveConnector, DEMO_FEED_NAME } from '../app/demoFeed.ts';
import { usageFeedSpecs } from '../app/usageFeeds.ts';
import { FeedRuntime } from '../feed/index.ts';
import type { Bindings } from '../report/render/bindings.ts';
import { resolveWorkbookMount } from '../app/dispatch.ts';
import { watchDocument } from '../document/watchDocument.ts';

export type ReportState =
  | { status: 'loading'; watching: boolean }
  | { status: 'error'; message: string; watching: boolean }
  | { status: 'ready'; session: ReportSession; bindings: Bindings; tick: number; watching: boolean };

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

export function useReport(seed: SeedDocument, mounts: readonly SandboxMount[] = []): ReportState & ReportReload {
  const [session, setSession] = useState<ReportSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // The staleness answer's reload half (DOCUMENT_NAVIGATOR_SPEC §4.4): a counter the
  // session-building effect keys on, so `reload()` re-reads the document through the
  // SAME mount resolution rather than remounting anything.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // The resolution the current mount set implies ('' when not dispatched) — the effect
  // key that rebuilds the session ONLY when the workbook appears/changes, never on an
  // unrelated mount update mid-document.
  const dispatchKey = useMemo(() => {
    const r = resolveWorkbookMount(mounts);
    return r.ok ? r.root : '';
  }, [mounts]);

  // R3-766 (§4.4 amended): a dispatched workbook's files change out-of-band — watch the
  // content mount and rebuild on change. One watch per dispatched root; a root change
  // aborts the old watch via this effect's cleanup before the new one starts. The watch
  // calls the existing `reload`, so the rebuild goes through the same session path.
  // `watching` is only TRUE once the watch has DELIVERED an event (that is what proves the
  // host relays to this mount) and has not gone unavailable — so a present-but-silent
  // watch keeps the §4.4 fallback notice rather than suppressing it. Both signals are
  // keyed by `dispatchKey` and set only from the watch's async callbacks.
  const [watchUnavailableFor, setWatchUnavailableFor] = useState<string | null>(null);
  const [watchLivenedFor, setWatchLivenedFor] = useState<string | null>(null);
  useEffect(() => {
    if (dispatchKey === '') return;
    const controller = new AbortController();
    watchDocument(
      dispatchKey,
      () => {
        setWatchLivenedFor(dispatchKey);
        reload();
      },
      {
        signal: controller.signal,
        onUnavailable: () => setWatchUnavailableFor(dispatchKey),
      },
    );
    return () => controller.abort();
  }, [dispatchKey, reload]);
  const watching = dispatchKey !== '' && watchLivenedFor === dispatchKey && watchUnavailableFor !== dispatchKey;

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
  }, [seed, mounts, dispatchKey, reloadToken]);

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

  if (error !== null) return { status: 'error', message: error, reload, watching };
  if (session === null || bindings === null) return { status: 'loading', reload, watching };
  return { status: 'ready', session, bindings, tick, reload, watching };
}
