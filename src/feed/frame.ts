// The feed frame model (ARCHITECTURE_PLAN §5.2). A connector materializes each received batch
// as a **frame**: an immutable set of rows with a **content-addressed id** and the wall-clock
// receipt time. Content-addressing is what makes "frozen snapshot per recalculation" true at
// the byte level (§5.2, review-1 F3) — the change notification carries the frame id and the
// engine opens *that* id, so there is never a torn read of half-of-frame-N/half-of-N+1, and
// conflation is just "advance the published id".
//
// A **gap frame** marks a discontinuity (a backgrounded-tab / mobile reconnect rejoins as a
// fresh subscription, §5.3): a window spanning it must surface as partial, never fabricated
// continuity. Pure — no clock, no I/O; `receivedAt` is passed in.

import type { Row } from '../stdlib/types.ts';
import { contentKey } from '../engine/hash.ts';

export interface Frame {
  /** Content-addressed id: `f:<hash>` for data, `gap:<receivedAt>` for a discontinuity marker. */
  id: string;
  rows: Row[];
  /** Wall-clock receipt time (epoch ms), passed in — the connector's clock, never ambient. */
  receivedAt: number;
  /** A discontinuity marker (reconnect): carries no rows; windows spanning it are partial. */
  gap: boolean;
}

/** Build a data frame from received rows, content-addressed for atomic versioned publication. */
export function frame(rows: Row[], receivedAt: number): Frame {
  return { id: `f:${contentKey(rows)}`, rows, receivedAt, gap: false };
}

/** A gap marker frame (subscription rejoin after a disconnect). */
export function gapFrame(receivedAt: number): Frame {
  return { id: `gap:${receivedAt}`, rows: [], receivedAt, gap: true };
}
