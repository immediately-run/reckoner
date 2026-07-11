// Content keys for early cutoff (ARCHITECTURE_PLAN §4.2). The scheduler skips propagating
// a recomputed cell whose result is unchanged; "unchanged" is decided by a **content key**,
// not reference identity alone. To keep cutoff sound (a stale value slipping through is a
// correctness hole, and — via the tier pair rule — a tier-laundering hole), the key is a
// *canonical serialization*, not a lossy digest: distinct values never share a key.
// Reference equality is the cheap fast path the scheduler checks first; this is the fallback.

import type { Value } from '../stdlib/types.ts';

/**
 * A canonical, collision-free string key for a plain value: object keys sorted, arrays in
 * order, scalars tagged by JSON so `1` (number) and `"1"` (string) never collide.
 */
export function contentKey(v: Value): string {
  return encode(v);
}

function encode(v: Value): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return `n:${v}`;
  if (typeof v === 'boolean') return `b:${v}`;
  if (typeof v === 'string') return `s:${JSON.stringify(v)}`;
  if (Array.isArray(v)) return `[${v.map(encode).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${encode(v[k])}`).join(',')}}`;
}
