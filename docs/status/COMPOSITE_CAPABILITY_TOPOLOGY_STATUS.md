# Status — Composite capability & lifecycle topology (D6 surfaces)

**Overall: the D6 consent/observability layer is built in BOTH halves — the decisions and the
surfaces that render them; the grant/lifecycle substrate it composes over (D1/D7/D8) is not.**
· **Created:** 2026-08-27 · **Updated:** 2026-08-27 (roadmap R3-229)

> This document is the **single implementation-status source** for
> [`specs/COMPOSITE_CAPABILITY_TOPOLOGY_SPEC.md`](../specs/COMPOSITE_CAPABILITY_TOPOLOGY_SPEC.md)'s
> D6 half. Where the spec and this file disagree, this file governs.

## Built — `site-main/src/registry/compositeConsent.ts`

| Exit criterion | State | How it is proven |
|---|---|---|
| Run-mode-first: a static document raises **zero** powerbox | ✅ | `planCompositeConsent` returns `{steps: [], silent: true}` when no member requests anything ungranted; asserted for the report-view + starved-engine pair |
| Un-bundled elevated line (TS-5b) | ✅ | one `ConsentLine` per capability, each flagged `separate`; a connector gets **one step per feed**, so three feeds are three decisions |
| Desktop and mobile ask the same questions | ✅ | the plan is form-factor independent by construction — there is no per-form-factor branch to drift |
| Tier badge host-drawn, **not** app-emittable (H2) | ✅ | `hostBadge` reads only the host-derived `trustMode`; a manifest carrying `badge`/`tier`/`verified` is asserted to be ignored, and the app's `label` stays text next to an unchanged badge |
| Aggregate reach view shows the **new total**, not the delta (RB-6) | ✅ | `aggregateReach` de-duplicates across existing and incoming sources; `"4 sources · 2 elevated"` |
| Manifest ↔ launch-graph reconciliation | ✅ | `reconcileLaunchGraph` — an **undeclared** launch fails the gate; a declared-but-not-launched member is reported and does not |
| Composite inspector: per-member status, per-member revoke | ✅ | `inspectComposite` — one row per realm, grants never merged; the starved engine is **shown holding nothing** rather than hidden |

## Built — the surfaces (site-main#378)

The decisions above are rendered by two components, tested as a separate claim from the plan
itself: a correct plan can still be drawn as a screen that bundles two grants into one row.

| Surface | Where | What the rendering guarantees |
|---|---|---|
| `CompositeConsentDialog` | `src/editor/spaces/CompositeConsentDialog.tsx` | a silent plan renders `null` (run-mode-first made structural, not left to callers); one card per realm; a `separate` line visually detached; a feed step per feed; an outbound feed given chrome an inbound one does not |
| `CompositeInspector` | `src/editor/spaces/CompositeInspector.tsx` | one row per realm, never merged; a realm holding nothing rendered as "Can reach nothing"; per-member revoke whose accessible name carries the realm |

The hostile-manifest case is rendered in a test rather than argued: a member labelled
`immediately.run · verified` carrying `badge: {trustMode: 'M0'}` renders that label as text
beside an unchanged `unverified` badge, and `first-party` never appears anywhere.

Mobile is one member per card by construction — the steps are a vertical list, so there is no
second layout that can drift into asking different questions.

## Not built

- **The substrate.** §2's matrix assumes D7 (a distinct `appKey` per realm), D8
  (per-instance launch/keep-warm/teardown) and D1 (per-instance delegation). None of those
  are built, so today there is nothing to build a real composite plan *from* — the module
  is correct and unreachable, which is the intended order (enforcement before authority)
  and worth stating plainly rather than implying the surface is live.

## The exit criterion that is NOT code, and must not be reported as met

**The E3 reach-view efficacy study.** Now the item's ONLY unmet exit criterion, and the
reason R3-229 should not be archived on the strength of the surfaces landing. §2.1 and RB-6
both mark reach-consent legibility as an open *empirical* question: whether a user reading "4 sources · 2 elevated" understands
their exposure, and whether an outbound-feed line is read as outbound. That is a behavioral
study, it gates M3 sharing, and no unit test substitutes for it. The tests above prove the
surface *computes* the right thing; they say nothing about whether it *communicates* it,
and a green suite must not be read as if they did.
