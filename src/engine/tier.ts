// The trust-tier lattice (ARCHITECTURE_PLAN §4.2, RQ-B4). A cell's tier is a second
// product of the recompute traversal: **tier = floor (greatest lower bound) over input
// tiers**, so a cell that touches any less-trusted input is itself no more trusted than
// that input. Static data is the most trusted (cleanest), a live feed the least. This is
// what makes early cutoff safe — the cutoff key is the pair `(value-hash, tier)`, never
// value alone, so an unchanged value with a changed tier still re-labels downstream.

export type Tier = 'static' | 'pulled' | 'live';

// Higher rank = more trusted. `meet` (floor) takes the lower rank.
const RANK: Record<Tier, number> = { live: 0, pulled: 1, static: 2 };

/** The floor of two tiers — the less-trusted one. */
export function meetTier(a: Tier, b: Tier): Tier {
  return RANK[a] <= RANK[b] ? a : b;
}

/** The floor over a list of tiers. An empty list is `static` (a constant is clean). */
export function meetTiers(tiers: readonly Tier[]): Tier {
  let acc: Tier = 'static';
  for (const t of tiers) acc = meetTier(acc, t);
  return acc;
}

/** Order two tiers by trust: negative if `a` is less trusted than `b`. */
export function compareTier(a: Tier, b: Tier): number {
  return RANK[a] - RANK[b];
}

/**
 * Whether an **autonomous** tier transition is monotone non-increasing (F7): an
 * autonomous tier may only drop or hold within a session — a re-raisable autonomous tier
 * could oscillate (the F2-style livelock). User-consent elevations are the deliberate,
 * human-rate exception and are not checked here (the session policy that raises them lives
 * in the engine shell).
 */
export function isAutonomousMonotone(prev: Tier, next: Tier): boolean {
  return RANK[next] <= RANK[prev];
}
