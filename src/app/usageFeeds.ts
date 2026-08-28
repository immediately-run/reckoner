// The usage workbook's feeds (PLATFORM_TELEMETRY_SPEC §13, roadmap R3-349) — the
// `Connector` port's first production egress binding. Each servable rollup becomes one
// `pollingConnector` whose `fetchFrame` POSTs to the platform's first-party analysis
// endpoint through the SDK's `hostFetch` (browser-direct `net:fetch`: the HOST performs
// the fetch with its real origin, injects the credential the app can never read, and
// refuses redirects — the §13 `redirect:'error'` rule is host machinery, not ours).
//
// The endpoint serves **materialised rollups only** with the k-floor applied
// server-side; the request vocabulary is a closed rollup name plus a bounded date
// window, so there is nothing here that could describe a row. Suppression is DATA, not
// noise: every reply's `suppressed`/`kFloor` land in a sixth meta feed the report
// renders, because a hidden zero is itself a signal.
//
// Like `demoFeed.ts`, this is app-side wiring, NOT document content — it never runs in
// the SES worker. Failure is a normal state, not an error: in vite dev (no host), on a
// fork without the `net:fetch` grant, or before the endpoint is deployed, every poll
// fails, the meta feed says so, and the report renders empty rather than crashing.

// The per-module subpath, deliberately: the SDK root carries module-scope host wiring
// that throws outside the sandbox, and this module must import cleanly in Node tests.
import { hostFetch } from '@immediately-run/sdk/netFetch';
import { manualConnector, pollingConnector } from '../feed/connector.ts';
import type { FeedSpec } from '../feed/runtime.ts';
import type { Row } from '../stdlib/types.ts';

/** The production analysis endpoint (site-main `registry/analysisCatalogue.ts` — its
 *  own Cloud Run origin, deliberately NOT the IR backend's; §17 records why). */
export const ANALYSIS_ORIGIN = 'https://ir-analytics-tv5se4cxdq-ew.a.run.app';
export const ROLLUP_PATH = '/api/v1/telemetry/rollup';

/** One servable rollup → one feed. `windowDays` bounds the request window (the
 *  endpoint refuses anything over its own cap; these stay far under it). */
export interface UsageRollupSpec {
  feed: string;
  rollup: string;
  windowDays: number;
}

/** The five servable rollups (`SERVABLE_ROLLUPS` in the backend's `telemetryRollupApi`).
 *  Boot health is deliberately absent: the endpoint refuses it, and asking would be the
 *  circular dependency §13 names — a site app cannot report that the site failed to boot. */
export const USAGE_ROLLUPS: readonly UsageRollupSpec[] = [
  { feed: 'repos_daily', rollup: 'repos.daily', windowDays: 28 },
  { feed: 'geography_daily', rollup: 'geography.daily', windowDays: 28 },
  { feed: 'retention_weekly', rollup: 'retention.weekly', windowDays: 84 },
  { feed: 'llm_daily', rollup: 'llm.daily', windowDays: 28 },
  { feed: 'contribution_daily', rollup: 'contribution.daily', windowDays: 28 },
];

/** The meta feed: one row per rollup with the latest fetch outcome + suppression. */
export const USAGE_META_FEED = 'usage_meta';

/** Every runtime feed the usage document may reference (xref allowance). */
export const USAGE_FEED_NAMES: readonly string[] = [...USAGE_ROLLUPS.map((r) => r.feed), USAGE_META_FEED];

/** A served rollup cell (`RollupCellOut` on the wire): dimension values + a count. */
interface WireCell {
  key: Record<string, string>;
  count: number;
}

export type RollupReply =
  | { ok: true; cells: WireCell[]; suppressed: number; kFloor: number }
  | { ok: false; code: string };

export interface UsageFeedDeps {
  /** POST one rollup query; resolve a typed reply, never throw. */
  fetchRollup: (body: { rollup: string; from: string; to: string }) => Promise<RollupReply>;
  now: () => number;
  /** Injected scheduler (returns a canceller) so polling is deterministic in tests. */
  schedule: (fn: () => void, ms: number) => () => void;
  intervalMs: number;
}

/** Rollups are materialised daily; a 5-minute poll is generous and cheap. */
const DEFAULT_INTERVAL_MS = 5 * 60_000;

const isWireCell = (v: unknown): v is WireCell => {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.count === 'number' && typeof c.key === 'object' && c.key !== null && !Array.isArray(c.key);
};

/** The default egress leg: `hostFetch` against the analysis endpoint. A reachable
 *  server's non-200 becomes `http-<status>`; a gate/SSRF/transport rejection surfaces
 *  its machine code (`forbidden`, `redirect`, `network`, …). */
export const fetchRollupViaHost = async (body: { rollup: string; from: string; to: string }): Promise<RollupReply> => {
  try {
    const res = await hostFetch(`${ANALYSIS_ORIGIN}${ROLLUP_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status !== 200) return { ok: false, code: `http-${res.status}` };
    const parsed: unknown = JSON.parse(res.body);
    if (typeof parsed !== 'object' || parsed === null) return { ok: false, code: 'malformed' };
    const p = parsed as Record<string, unknown>;
    if (p.ok !== true || !Array.isArray(p.cells) || !p.cells.every(isWireCell)) {
      return { ok: false, code: 'malformed' };
    }
    return {
      ok: true,
      cells: p.cells,
      suppressed: typeof p.suppressed === 'number' ? p.suppressed : 0,
      kFloor: typeof p.kFloor === 'number' ? p.kFloor : 0,
    };
  } catch (e) {
    return { ok: false, code: (e as { code?: string }).code ?? 'network' };
  }
};

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The inclusive `from`/`to` window ending today (UTC), `windowDays` wide. */
export const rollupWindow = (nowMs: number, windowDays: number): { from: string; to: string } => ({
  from: isoDay(nowMs - (windowDays - 1) * 86_400_000),
  to: isoDay(nowMs),
});

/** Wrap a scheduler so the FIRST tick fires immediately: `pollingConnector` waits a
 *  full interval before its first fetch, which is right for a 1.5s demo feed and wrong
 *  for a 5-minute rollup poll (the report would open empty for 5 minutes). */
const immediateFirst = (schedule: UsageFeedDeps['schedule']): UsageFeedDeps['schedule'] => {
  let first = true;
  return (fn, ms) => {
    const delay = first ? 0 : ms;
    first = false;
    return schedule(fn, delay);
  };
};

/**
 * Build the usage document's `FeedSpec`s: five polling rollup feeds plus the meta feed.
 * Every fetch — success or failure — refreshes that rollup's row in the meta feed, so
 * the report can always say WHY a chart is empty (`forbidden` reads very differently
 * from `http-503`). A failed fetch delivers no data frame (the previous snapshot is
 * kept), which is `pollingConnector`'s skip semantics.
 */
export function usageFeedSpecs(overrides: Partial<UsageFeedDeps> = {}): FeedSpec[] {
  const deps: UsageFeedDeps = {
    fetchRollup: overrides.fetchRollup ?? fetchRollupViaHost,
    now: overrides.now ?? (() => Date.now()),
    schedule:
      overrides.schedule ??
      ((fn, ms) => {
        const h = setTimeout(fn, ms);
        return () => clearTimeout(h);
      }),
    intervalMs: overrides.intervalMs ?? DEFAULT_INTERVAL_MS,
  };

  const meta = manualConnector();
  // Latest outcome per rollup; the meta feed re-publishes the WHOLE set on every
  // change so its snapshot always covers all five rollups.
  const outcomes = new Map<string, Row>();
  const publishMeta = (): void => {
    meta.push(
      USAGE_ROLLUPS.map((r) => r.feed).flatMap((feed) => {
        const row = outcomes.get(feed);
        return row === undefined ? [] : [row];
      }),
      deps.now(),
    );
  };

  const rollupSpec = (r: UsageRollupSpec): FeedSpec => ({
    name: r.feed,
    tier: 'pulled',
    retention: { keepLast: 8 },
    connector: pollingConnector({
      intervalMs: deps.intervalMs,
      now: deps.now,
      schedule: immediateFirst(deps.schedule),
      fetchFrame: async () => {
        const { from, to } = rollupWindow(deps.now(), r.windowDays);
        const reply = await deps.fetchRollup({ rollup: r.rollup, from, to });
        if (!reply.ok) {
          outcomes.set(r.feed, { rollup: r.rollup, status: reply.code, cells: 0, suppressed: 0, kFloor: 0, from, to });
          publishMeta();
          // Reject so pollingConnector skips this frame (last good snapshot stays).
          throw new Error(`rollup ${r.rollup}: ${reply.code}`);
        }
        outcomes.set(r.feed, {
          rollup: r.rollup,
          status: 'ok',
          cells: reply.cells.length,
          suppressed: reply.suppressed,
          kFloor: reply.kFloor,
          from,
          to,
        });
        publishMeta();
        // A cell is dimension values + a count, flattened per the feed row convention.
        return reply.cells.map((c) => ({ ...c.key, count: c.count }));
      },
    }),
  });

  return [
    ...USAGE_ROLLUPS.map(rollupSpec),
    { name: USAGE_META_FEED, connector: meta, tier: 'pulled', retention: { keepLast: 1 } },
  ];
}
