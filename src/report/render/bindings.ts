// The renderer's data port (ARCHITECTURE_PLAN §3.3). The report view never touches the
// engine directly: it resolves every `source` binding through this injected `Bindings`
// collaborator, exactly the "separate pure logic from the effectful collaborator, inject the
// collaborator as a port" discipline the rest of the spine follows. Shell B supplies an
// adapter from the engine's `PassResult` (value + tier per cell) and its `params` inputs;
// tests supply a hand-built map. The renderer stays framework-only-glue and unit-testable.

import type { Value } from '../../stdlib/types.ts';
import type { Tier } from '../../engine/tier.ts';

/** Whether a bound cell resolved, errored (threw in the engine), or was never declared. */
export type BindingStatus = 'ok' | 'error' | 'missing';

/**
 * A resolved binding: the published value **with its tier** (§3.3 point 3 — values arrive
 * with their tier; the badge is host-rendered chrome, we only carry the value). A non-`ok`
 * status drives a component-owned degraded state (broken tile / needs-access), never a crash.
 */
export interface BoundValue {
  value: Value;
  tier: Tier;
  status: BindingStatus;
  /** Human-readable reason when `status !== 'ok'` (a broken tile's caption in edit mode). */
  message?: string;
}

/**
 * The data port the renderer resolves against. `resolve` maps a dotted binding name
 * (`revenue.by_month`, `params.region`) to its current value+tier; `setParam` closes the
 * interaction loop — a widget writes a `params.*` input cell and the host recomputes (§3.3
 * "widgets write to input cells"). Both are host/engine effects behind a pure interface.
 */
export interface Bindings {
  resolve(source: string): BoundValue;
  setParam(name: string, value: Value): void;
}

/** A `missing` binding — the name is not published (unknown cell / undeclared feed). */
export function missing(source: string): BoundValue {
  return { value: null, tier: 'live', status: 'missing', message: `no data bound to "${source}".` };
}
