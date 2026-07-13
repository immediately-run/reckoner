// The connector — the config-driven pipe that delivers frames (ARCHITECTURE_PLAN §5.1). It
// "reads `feeds/*.feed.json`, fetches on schedule or holds a subscription, materializes frames,
// emits change notifications" and "executes no content and hosts no agent; fetched bytes never
// determine fetch targets. All egress goes through the host proxy." Modeled as an injected
// **port** so the effectful egress (the host SSRF-proxied fetch) lives at the edge: the runtime
// drives a `Connector`, and a real one wraps the host fetch capability while the polling/manual
// ones here are fully testable offline.

import type { Row } from '../stdlib/types.ts';

/** How a connector notifies the runtime of new frames and discontinuities. */
export interface ConnectorSink {
  frame(rows: Row[], receivedAt: number): void;
  /** A discontinuity (a rejoin after a disconnect) — the runtime marks a buffer gap. */
  gap(receivedAt: number): void;
}

export interface Connector {
  /** Begin delivering to `sink`; returns a stop function that ends the subscription/schedule. */
  start(sink: ConnectorSink): () => void;
}

/**
 * A manual connector — the runtime-facing double for tests/dev and for a host `subscribe`
 * stream the caller pumps. `push`/`gap` deliver into whatever sink is currently started.
 */
export function manualConnector(): Connector & { push: (rows: Row[], at: number) => void; gap: (at: number) => void } {
  let sink: ConnectorSink | null = null;
  return {
    start(s) {
      sink = s;
      return () => {
        if (sink === s) sink = null;
      };
    },
    push(rows, at) {
      sink?.frame(rows, at);
    },
    gap(at) {
      sink?.gap(at);
    },
  };
}

export interface PollingOptions {
  /** Fetch one frame's rows. In production this goes through the host SSRF proxy (injected). */
  fetchFrame: () => Promise<Row[]>;
  intervalMs: number;
  now: () => number;
  /** Injected scheduler (returns a canceller) so polling is deterministic in tests. */
  schedule: (fn: () => void, ms: number) => () => void;
}

/**
 * A `mode: "poll"` connector: fetch a frame every `intervalMs`. A fetch that rejects is skipped
 * (anti-abuse fails open, §2 practices); a rejoin after a failed fetch is not a data gap, so no
 * gap is emitted here — gap markers belong to subscription reconnects.
 */
export function pollingConnector(opts: PollingOptions): Connector {
  return {
    start(sink) {
      let stopped = false;
      let cancel = (): void => {};
      const tick = (): void => {
        if (stopped) return;
        void opts
          .fetchFrame()
          .then((rows) => {
            if (!stopped) sink.frame(rows, opts.now());
          })
          .catch(() => {
            /* skip a failed poll; the next tick retries */
          })
          .finally(() => {
            if (!stopped) cancel = opts.schedule(tick, opts.intervalMs);
          });
      };
      cancel = opts.schedule(tick, opts.intervalMs);
      return () => {
        stopped = true;
        cancel();
      };
    },
  };
}
