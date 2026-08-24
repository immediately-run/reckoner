// Input resolution — the single place a node's declared inputs become concrete (value, tier)
// pairs from currently-published state (ARCHITECTURE_PLAN §4.2). Extracted so the synchronous
// `Scheduler` (main-thread) and the async worker-backed engine share **one** resolution path
// rather than two that drift ("one resolution entry point per concern"). Pure: it reads the
// published results / externals / worksheet lists it is handed and returns the input values +
// the tier list to fold; it never evaluates or mutates.
//
// Windowed feeds (`{ feed, window }`, ARCHITECTURE_PLAN §3 "Feeds and time") resolve here,
// never inside a formula: the slice is `window()` over the `feedBuffers.<feed>` external with
// `now` taken from the `params.now` external when the workbook provides one, else the newest
// retained event time — a pure function of published state, never an ambient clock. Rows whose
// `by` value carries no usable event time drop out of the window (they cannot be placed in
// event time), matching `window()`'s absent-`by` rule; resolution never throws, so one bad
// frame cannot reject the pass.

import type { Row, Value } from '../stdlib/types.ts';
import { window } from '../stdlib/window.ts';
import { eventTimeOf } from '../stdlib/window.ts';
import type { InputResolver, PublishedResult } from './types.ts';
import type { Tier } from './tier.ts';

/** The published state resolution reads from. */
export interface ResolveState {
  results: Map<string, PublishedResult>;
  externals: Map<string, { value: Value; tier: Tier }>;
  /** Cell ids per worksheet, for `<worksheet>.*` wildcard expansion. */
  worksheets: Map<string, string[]>;
}

/** The external key a feed's retained rows are published under (the `FeedRuntime` writes it). */
export const FEED_BUFFER_PREFIX = 'feedBuffers.';

/** Resolve a node's declared inputs to values (by local name) + the tiers to fold. */
export function resolveInputs(resolvers: readonly InputResolver[], state: ResolveState): {
  values: Record<string, Value>;
  tiers: Tier[];
} {
  const values: Record<string, Value> = {};
  const tiers: Tier[] = [];
  for (const r of resolvers) {
    if (r.kind === 'windowed-feed') {
      const { value, tiers: folded } = resolveWindowedFeed(r, state);
      values[r.name] = value;
      tiers.push(...folded);
    } else if (r.kind === 'external') {
      const ext = state.externals.get(r.key);
      values[r.name] = ext?.value ?? null;
      tiers.push(ext?.tier ?? 'static');
    } else if (r.kind === 'cell') {
      const res = state.results.get(r.nodeId);
      values[r.name] = res?.value ?? null;
      tiers.push(res?.tier ?? 'static');
    } else {
      // wildcard: an object of every cell in the worksheet, keyed by short cell name.
      const cells = state.worksheets.get(r.worksheet) ?? [];
      const candidates: Record<string, Value> = {};
      for (const cellId of cells) {
        const res = state.results.get(cellId);
        candidates[shortName(cellId)] = res?.value ?? null;
        tiers.push(res?.tier ?? 'static');
      }
      values[r.name] = candidates;
    }
  }
  return { values, tiers };
}

/** The cell name without its worksheet prefix (`revenue.by_month` → `by_month`). */
export function shortName(id: string): string {
  const dot = id.indexOf('.');
  return dot === -1 ? id : id.slice(dot + 1);
}

/** The event-time slice of a feed's retained rows, per the declared window. Never throws. */
function resolveWindowedFeed(
  r: Extract<InputResolver, { kind: 'windowed-feed' }>,
  state: ResolveState,
): { value: Row[]; tiers: Tier[] } {
  const ext = state.externals.get(`${FEED_BUFFER_PREFIX}${r.feed}`);
  const rows: Row[] = Array.isArray(ext?.value) ? (ext!.value as Row[]) : [];
  const tiers: Tier[] = [ext?.tier ?? 'static'];

  // The clock: a declared `params.now` wins; else the newest retained event time (a pure
  // function of the buffer — no ambient clock). Absent/unusable → no events can be placed.
  const nowExt = state.externals.get('params.now');
  const now = (nowExt !== undefined && nowExt.value !== null ? eventTimeOf(nowExt.value) : undefined)
    ?? newestEventTime(rows, r.by);
  if (nowExt !== undefined) tiers.push(nowExt.tier);

  if (now === undefined) return { value: [], tiers };
  // Pre-filter to rows with a usable event time so `window()` (which throws on malformed
  // values, correctly, when a *formula* calls it) never sees one here.
  const placeable = rows.filter((row) => eventTimeOf(row[r.by]) !== undefined);
  return { value: window(placeable, { by: r.by, within: r.window, now }), tiers };
}

/** The newest usable event time among the rows, or `undefined` when none carries one. */
function newestEventTime(rows: Row[], by: string): number | undefined {
  let newest: number | undefined;
  for (const row of rows) {
    const t = eventTimeOf(row[by]);
    if (t !== undefined && (newest === undefined || t > newest)) newest = t;
  }
  return newest;
}
