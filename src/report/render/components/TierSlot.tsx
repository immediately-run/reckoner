// The reserved tier/trust badge slot (§3.3 point 3, review-1 H2). The badge is **host-drawn
// chrome, not Reckoner's** — a trust signal drawn by app code is forgeable by a malicious
// fork (receive `tier=live`, render a `static` badge). So we render an empty, host-fillable
// slot that only *carries* the tier as a data attribute; the host paints the actual badge
// into it. Standalone (no host), the slot is invisible. Never render badge text here.
import type { Tier } from '../../../engine/tier.ts';

export default function TierSlot({ tier }: { tier: Tier }) {
  return <span className="rk-tier-slot" data-tier={tier} data-host-badge aria-hidden="true" />;
}
