// A synthetic live feed for the bundled demo (ARCHITECTURE_PLAN §5.1). Reckoner's whole point is
// live reporting, so the demo document carries one *live* metric — active sessions per region —
// to show a feed driving a recompute end-to-end. A real feed's frames come from the host
// SSRF-proxied fetch; this stand-in is an ordinary `pollingConnector` whose `fetchFrame`
// generates a random-walk snapshot instead of hitting the network, so the demo needs no host
// grant. This is app-side dev infra, NOT document content — it never runs in the SES worker, so
// its `Date.now`/`Math.random` are fine (the confinement is on formulas, not the connector).

import { pollingConnector } from '../feed/connector.ts';
import type { Connector } from '../feed/connector.ts';
import type { Row } from '../stdlib/types.ts';

const REGIONS = ['amer', 'emea', 'apac', 'latam'];

/** A poll connector emitting a full active-sessions-by-region snapshot each tick (random walk). */
export function demoLiveConnector(intervalMs = 1500): Connector {
  const sessions = new Map(REGIONS.map((r) => [r, 180 + Math.floor(Math.random() * 220)]));
  const fetchFrame = async (): Promise<Row[]> =>
    REGIONS.map((r) => {
      const next = Math.max(20, Math.min(640, (sessions.get(r) ?? 200) + Math.round((Math.random() - 0.5) * 90)));
      sessions.set(r, next);
      return { region: r, sessions: next };
    });

  return pollingConnector({
    fetchFrame,
    intervalMs,
    now: () => Date.now(),
    schedule: (fn, ms) => {
      const h = setTimeout(fn, ms);
      return () => clearTimeout(h);
    },
  });
}

/** The feed name the demo connector publishes under (`feeds.live_regions`). */
export const DEMO_FEED_NAME = 'live_regions';
