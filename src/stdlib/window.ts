// Event-time windowing (ARCHITECTURE_PLAN §3.1/§4.1, DSL-8). A feed is a frozen snapshot
// per recalculation; *history* is this explicit `window()` abstraction over the connector's
// retained buffer, declared at the input site (`{ feed: "orders", window: "1h" }`) — never
// conjured inside a formula, and never an ambient clock. `now` is passed in (a declared
// `params.now`); event times are epoch-ms numbers or ISO strings.
//
// Naming note (DSL-8): this `window` (event-time feed buffering) is distinct from the window
// *functions* `lag`/`lead`/`scan` in ./ordered.ts.

import type { Row, Value } from './types.ts';

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000, // minutes (event-time windows are sub-day; use the date helpers for months)
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** Parse a duration like "1h", "30m", "7d", "500ms" into milliseconds. */
export function parseDuration(spec: string): number {
  const m = /^(\d+)(ms|s|m|h|d|w)$/.exec(spec.trim());
  if (!m) throw new Error(`Invalid duration: ${JSON.stringify(spec)}`);
  return Number(m[1]) * UNIT_MS[m[2]];
}

function toEpoch(v: Value): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isNaN(t)) throw new Error(`Invalid event time: ${JSON.stringify(v)}`);
    return t;
  }
  throw new Error(`Invalid event time: ${JSON.stringify(v)}`);
}

/**
 * The events whose `by` timestamp falls within the trailing `within` duration ending at
 * `now`, inclusive — the event-time slice of a feed buffer. Rows with an absent `by` are
 * dropped. Order is preserved.
 */
export function window(
  events: Row[],
  opts: { by: string; within: string; now: Value },
): Row[] {
  const end = toEpoch(opts.now);
  const start = end - parseDuration(opts.within);
  return events.filter((e) => {
    const t = e[opts.by];
    if (t === null || t === undefined) return false;
    const et = toEpoch(t);
    return et >= start && et <= end;
  });
}
