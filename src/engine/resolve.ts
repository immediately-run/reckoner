// Input resolution — the single place a node's declared inputs become concrete (value, tier)
// pairs from currently-published state (ARCHITECTURE_PLAN §4.2). Extracted so the synchronous
// `Scheduler` (main-thread) and the async worker-backed engine share **one** resolution path
// rather than two that drift ("one resolution entry point per concern"). Pure: it reads the
// published results / externals / worksheet lists it is handed and returns the input values +
// the tier list to fold; it never evaluates or mutates.

import type { Value } from '../stdlib/types.ts';
import type { InputResolver, PublishedResult } from './types.ts';
import type { Tier } from './tier.ts';

/** The published state resolution reads from. */
export interface ResolveState {
  results: Map<string, PublishedResult>;
  externals: Map<string, { value: Value; tier: Tier }>;
  /** Cell ids per worksheet, for `<worksheet>.*` wildcard expansion. */
  worksheets: Map<string, string[]>;
}

/** Resolve a node's declared inputs to values (by local name) + the tiers to fold. */
export function resolveInputs(resolvers: readonly InputResolver[], state: ResolveState): {
  values: Record<string, Value>;
  tiers: Tier[];
} {
  const values: Record<string, Value> = {};
  const tiers: Tier[] = [];
  for (const r of resolvers) {
    if (r.kind === 'external') {
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
