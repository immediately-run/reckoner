// The static buffer-covers-window check (ARCHITECTURE_PLAN §5.3). "The engine statically checks
// the declarable constraint **buffer ≥ longest dependent window** and reports violations at edit
// time." A formula that windows `1h` over a feed the connector only retains for `30m` can never
// see a full window — that is an authoring error, catchable before a single frame arrives. Pure:
// it compares declared durations, no runtime data.
//
// A time window over a **count-retained** feed (`keepLast`, no `keepFor`) cannot be verified
// statically — coverage then depends on the arrival rate — so it is a *warning*, not a pass and
// not a hard error.

import { parseDuration } from '../stdlib/window.ts';
import type { RetentionPolicy } from './buffer.ts';

/** A window declared at an input site (`{ feed, window }` on a cell), for the diagnostic. */
export interface WindowDecl {
  feed: string;
  window: string;
  /** The declaring cell id, for the edit-time diagnostic. */
  site: string;
}

export interface CoverageViolation {
  severity: 'error' | 'warning';
  feed: string;
  window: string;
  site: string;
  message: string;
}

/**
 * Check every declared window against its feed's retention. `retentions` maps feed name →
 * policy. An unknown feed, or a window longer than a time-bounded buffer, is an error; a window
 * over a count-only (or unbounded) buffer is a warning.
 */
export function checkBufferCoversWindows(
  retentions: Record<string, RetentionPolicy>,
  windows: readonly WindowDecl[],
): CoverageViolation[] {
  const out: CoverageViolation[] = [];
  for (const w of windows) {
    const windowMs = parseDuration(w.window);
    const policy = retentions[w.feed];
    if (policy === undefined) {
      out.push({ severity: 'error', feed: w.feed, window: w.window, site: w.site, message: `window over unknown feed "${w.feed}".` });
      continue;
    }
    if (policy.keepFor === undefined) {
      out.push({
        severity: 'warning',
        feed: w.feed,
        window: w.window,
        site: w.site,
        message: `feed "${w.feed}" has no keepFor — a ${w.window} window over a count-retained buffer can't be guaranteed statically.`,
      });
      continue;
    }
    if (windowMs > parseDuration(policy.keepFor)) {
      out.push({
        severity: 'error',
        feed: w.feed,
        window: w.window,
        site: w.site,
        message: `window ${w.window} exceeds feed "${w.feed}" retention keepFor=${policy.keepFor}.`,
      });
    }
  }
  return out;
}
