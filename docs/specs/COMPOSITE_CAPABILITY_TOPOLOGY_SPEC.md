# immediately.run Composite Capability & Lifecycle Topology — how a multi-realm app's grants compose

**Status:** proposal / draft — **Spine 2** of the Reckoner up-front-design triage
(`../ARCHITECTURE_PLAN.md` §0.1), but written as a **platform** spec: it
generalizes to any composite app, with Reckoner as the forcing consumer. It resolves how the
four separately-specified deltas — **D1** (per-instance delegation), **D7/AA-01** (program-identity
`appKey`), **D8** (launch-to-run / standing-app lifecycle), **D9** (redacted mount) — **compose**
into one grant topology. Rides the **design-pending D8**. Design only; nothing built. · **Updated:** 2026-07-09

> **The single implementation-status source for this spec is
> `docs/status/COMPOSITE_CAPABILITY_TOPOLOGY_STATUS.md`** (to be created at build) — where they
> disagree, the status doc governs.

> **Reads first:** `STANDING_APP_LIFECYCLE_SPEC.md` §4.1/§5/§5.1/§6.1 (launch, keep-warm,
> teardown, per-instance delegation — the D8 substrate); `AGENT_AUTHORING_ARCHITECTURE.md` §5/§5.1
> (program identity, AA-01/D7); `UI_AS_APPS_SPEC.md` §8.15 (attenuated delegation, downward-only),
> §5.7 (task model), §8.1 (downward-only authority); `REPORTING_SPREADSHEET_SPEC.md` §3.2 (the
> no-both invariant this topology enforces structurally), §6 (the composite), §11 (RS-1/RS-6
> containment); `../ARCHITECTURE_PLAN.md` §2 (the four realms), §9 (the deltas);
> `ENGINE_INFORMATION_FLOW_SPEC.md` §5 OQ-3 (the "audience" principals this spec must make
> distinguishable). Companion: `HOLDOUT_REDACTED_MOUNT_SPEC.md` (D9, the assistant's mount scope).

---

## 0. Why this is up-front, and why one spec  *(normative intent)*

The composite's isolation is **the** confidentiality property (`REPORTING §3.1`): every realm's
"it cannot reach X" claim is a claim about *which grant it holds and for how long*. Today that
is specified in four fragments — D1/D7/D8/D9 each design a piece — with **no single statement of
who mints which grant to which realm, at what tier, and over what lifetime.** Fragmentary
capability specs are exactly what failed twice in Reckoner's runtime design (adversarial-review-2);
the capability *topology* is more dangerous to leave fragmentary, because a gap is not a glitch —
it is a silent authority the isolation model assumed away.

Two facts make this up-front:

1. **It rides the design-pending D8** (launch-to-run / standing-app lifecycle, `STANDING_APP_LIFECYCLE`
   Open Q#10). Grants have *lifetimes* tied to member launch/teardown; without the lifecycle
   model, "the connector's grant exists only while its feed is live" has no mechanism.
2. **It is the thing that turns the no-both invariant from *app discipline* into *host
   enforcement*.** Pre-D7/D8/D9 the four-realm isolation is a fork-weakenable fiction (the plan
   admits this, PD-6/M7); the composed topology is what makes it real. Getting the composition
   wrong means the isolation is fiction *even after* the deltas land.

## 1. The composite is a set of principals, not a principal  *(normative)*

A composite (Reckoner: report-view root + engine + connector + assistant) is **N distinct
program identities**, one `appKey` per realm (D7/AA-01). Grants **key per realm and never
merge** (`REPORTING §6` RB-1: no composite principal, no merged bundle). Each realm earns its
own authority; the root **launches** members but does not **lend** them its grants ambiently
(downward-only, `UI_AS_APPS §8.1`). Membership is binding-resolved roles, user-overridable, and
the trust badge reflects the actually-bound provider (`REPORTING §6.1`).

## 2. The realm × capability × minting-authority × lifetime matrix  *(proposal — the heart)*

For Reckoner's four realms (the pattern generalizes: `{holds, minted-by, tier, lifetime}` per
realm). "Minted-by" is the **only** principal that may create the grant; "lifetime" is when it
exists (§3).

| Realm (appKey) | Holds | Minted by | Tier | Lifetime |
|---|---|---|---|---|
| **Report-view (root)** | `rw@self` (its source + the document, **defined as the enumerated authoring subtrees**, D9); the composite-root right to **launch members** | host, from the user's grant at composite open | the document's mount tier | the session (open → close) |
| **Engine** | **nothing** — starved by design (`REPORTING §3.1`); input injection is host-brokered, **not a grant** | host mints an **empty bundle** (D7 gate: the engine entry point resolves to `{}`) | n/a (holds no data-bearing grant) | launched with the root; warm across recomputes; torn down at close |
| **Connector** | `feed:fetch` (template-bound, **not** general `net:fetch` — D2), `secrets:use` (use-not-read), per-instance-delegated **narrow source reads** (D1) | host, **per feed-instance, at feed-activation consent** (individual, never bundled — RB-3) | one tier per feed-instance (RQ-E2) | **per feed-instance:** launched at activation, **kept warm** while the feed is live (poll/subscription), torn down at deactivation or session end |
| **Assistant** | `llm:chat` (egress), `rw@self` (authoring subtrees; **further redacted to exclude `.holdout/` during inference** — D9) | host, at assistant launch | its read tier follows the document; taints on reading M3 (`§8.1`) | launched on demand; warm during a session; torn down |

**Minting rules (the invariant behind the matrix):**

- **Only the host mints a grant to a realm.** No realm mints for a sibling. The root may
  **attenuate** a capability it *already holds* down to a member (the `edit-file`/`capDir`
  pattern, `§8.15`, `DelegatableMount`) — **downward-only, never amplifying** (a member cannot
  receive more than the root holds; escape → fail-closed).
- **A grant's tier is host-authoritative** (the mount/feed tier), never content- or
  member-declared (`ENGINE_INFORMATION_FLOW §3`).
- **Per-instance grants are keyed on a host-minted instance id** (D1 + D2's anti-bucket rule):
  two instances of one connector `appKey` share **no** source grant.

## 3. The lifecycle state machine — grants live and die with members  *(normative — the D8 dependency)*

Every member moves through a host-driven lifecycle; **a grant exists iff its member is in a live
state, and teardown revokes it.** This is the D8 substrate (`STANDING_APP_LIFECYCLE §4.1/§6.1`).

```
  unlaunched ──launch──► live ──idle──► warm ──resume──► live
                          │               │
                          └──teardown─────┴──► torn-down   (grants revoked)
```

- **Report-view root:** `launch` at document open → `live` for the session → `teardown` at
  close. Its launch is what mints the members' launch right.
- **Engine:** launched with the root (rendering needs it); `warm` between recomputes (keep-warm
  avoids re-`lockdown()` cost); `teardown` at close **or** on the synchronous-runaway rebuild
  (`ARCHITECTURE_PLAN §4.1` — a whole-context teardown that re-launches from host-side state).
  It holds nothing, so teardown revokes nothing sensitive — but its **output channels** are
  governed separately (Spine 1).
- **Connector:** **one lifecycle per feed-instance.** `launch` at feed-activation consent; `warm`
  while the feed is live (a poll timer / open subscription must persist — this is *the* reason
  D8 keep-warm is load-bearing here); `teardown` at feed deactivation or session end, which
  **revokes that instance's `feed:fetch` + `secrets:use` + source-read**. A keep-warm connector
  across a **tier change** must **re-tier or be torn down** (ties to `ARCHITECTURE_PLAN §4.2` F7:
  an autonomous tier drop re-floors; it cannot silently keep a stale higher grant warm).
- **Assistant:** `launch` on demand; `warm` during the session; `teardown` on session end. Its
  `.holdout/`-redaction (D9) is a property of the *standing* grant, not a mode — there is no
  warm state in which it holds a broader mount (`HOLDOUT §4`).

**The keep-warm covert-channel note:** a member's launch/teardown *timing* is a ~1-bit
side-channel (`STANDING_APP_LIFECYCLE §6.4`). Debounce a member's self-exit so it is
indistinguishable from a user-driven teardown — carried here as a composition requirement, not
re-derived.

## 4. How the four deltas compose — the point of the spec  *(normative)*

Each delta supplies one axis; the topology is their product, and the no-both invariant
(`REPORTING §3.2`) is enforced structurally **only when all four hold**:

| Delta | Axis it supplies | Without it |
|---|---|---|
| **D7 / AA-01** | *identity* — a distinct `appKey` per realm, so grants key per realm | all realms share one `appKey`; grants **bleed** (the M7 window: the engine effectively holds the assistant's `llm:chat`) |
| **D8** | *lifetime* — per-instance launch / keep-warm / teardown, so a grant exists only while its member does | grants have no teardown; a deactivated feed's `secrets:use` persists; keep-warm impossible → no live feeds |
| **D1** | *instance isolation* — per-instance delegation, so two instances of one `appKey` share no source grant | one connector's feeds cross-contaminate; over-broad source reads |
| **D9** | *intra-realm scope* — the assistant's `rw@self` is the authoring subtrees, redacted during inference | the assistant reads `.holdout/` and any document path trivially |

**The composition invariant:** *no realm ever simultaneously (a) executes content as code, (b)
holds a Class-B capability, and (c) hosts an injectable agent — and the grant topology makes each
of a/b/c a property of a distinct `appKey` with a bounded lifetime, so a fork cannot merge them.*
The engine executes content (a) but holds nothing (¬b) and hosts no agent (¬c); the connector
holds Class-B (b) but executes no content (¬a, D2 target-fixing) and hosts no agent (¬c); the
assistant hosts an agent (c) but is Class-A only (¬b) and executes no content (¬a). D7 keeps
these three `appKey`s distinct; D8 bounds their lifetimes; D1/D9 scope them. **Pre-any-of-these
the invariant is app discipline (fiction); post-all-four it is structural.**

## 5. Adversarial composition checks  *(normative intent)*

- **Engine as confused deputy.** It holds nothing, so it cannot be steered to egress — but its
  *output* is data that could carry M3 tiers/holdout. Contained by **Spine 1** (the channel
  contract), not by this topology; noted so the boundary is explicit.
- **Root amplifying a member.** The root attenuates a `capDir` to a member (`edit-file`); the
  chroot is downward-only and fail-closed (`attenuateDelta`), so a member cannot receive a
  capability the root lacks. Verified sound in D9's review.
- **Connector keep-warm across a tier drop.** The warm instance cannot silently retain a higher
  grant; the lifecycle forces re-tier or teardown (§3), composing with F7 monotonicity.
- **The shared-appKey window (pre-D7).** Honest fiction, bounded to author's-own-documents-only
  (`ARCHITECTURE_PLAN` R-2/M7); this spec is the definition of when it ends (D7+D8+D9 all live).
- **Cross-member task invocation.** A member invoking another (`§5.7`) satisfies the callee's
  required delta from the caller's own grants, attenuated (`§8.15`) — never amplified; undeclared
  invocations rejected (`REPORTING` §6 `invokes`/`provides`).

## 6. Load-bearing assumptions & code anchors

### Depends-on-today (verified 2026-07-09)

| Assumption (existing behavior the design rests on) | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| Delegation is downward-only, chroot-inside-caller, fail-closed | `immediately-run-site-main/src/editor/task/attenuateDelta.ts` | `DelegatableMount` |
| A capability's effective set is `manifest ∩ grant` (least privilege both ends) | `immediately-run-site-main/src/registry/netFetchPolicy.ts` | `effectiveAllowlist` |
| A frame's held capabilities are set host-side per app/consent, not self-declared | `immediately-run-site-main/src/editor/SandboxListener.ts` | `net:fetch` |

### Must-establish (new invariants the implementation creates)

| New invariant | Proven by (gate test) |
|---|---|
| Each realm resolves to a distinct `appKey`; grants do not merge (D7) | sibling-isolation gate: two entry points of one repo hold disjoint bundles; the engine resolves to `{}` |
| A grant exists iff its member is live; teardown revokes it (D8) | lifetime gate: a deactivated feed-instance's `secrets:use`/`feed:fetch` is revoked; a torn-down member holds nothing |
| Per-instance grants share no source across instances of one `appKey` (D1) | per-instance gate: two connector instances hold disjoint source grants; instance id is host-minted |
| No realm holds two of {executes content, Class-B cap, injectable agent} | no-both gate: the engine/connector/assistant each fail the two-of-three check under a hostile fork |
| The root can attenuate but never amplify a member's grant | amplification gate: a member cannot receive a capability the root lacks (fail-closed) |
| Member launch/teardown timing is debounced (covert-channel bound) | timing gate: a member self-exit is indistinguishable from a user teardown |

## 7. Decisions & rejected alternatives

- **One topology spec composing D1/D7/D8/D9; the composite is N principals, grants never merge.**
  *Rejected:* leaving the four deltas as independent fragments (the isolation property has no
  single owner — the gap this spec closes); a composite *principal* with a merged bundle
  (`REPORTING` RB-1: a fork lies; grants must key per realm).
- **Grants have lifetimes tied to member launch/teardown (rides D8).** *Rejected:* session-long
  static grants (a deactivated feed keeps `secrets:use`); no keep-warm (no live feeds).
- **Only the host mints; the root attenuates downward-only.** *Rejected:* peer-to-peer grant
  lending between realms (amplification path); ambient inheritance from the root.
- **The no-both invariant is structural only post-D7+D8+D9; honest as app-discipline before.**
  *Rejected:* claiming structural isolation before the deltas land (the M7 fiction).
- **Written as a platform spec, not a Reckoner-internal one.** *Rejected:* scoping it to Reckoner
  (it generalizes to any composite; Reckoner is the forcing consumer, and D8 is platform work).

## 8. Open questions

- **OQ-1 (D8 is design-pending).** The launch-to-run / keep-warm / teardown substrate
  (`STANDING_APP_LIFECYCLE` Open Q#10) is itself not fully designed. This spec **assumes** its
  shape (per-instance launch, keep-warm, teardown revokes); the D8 design must confirm the
  lifetime semantics this topology rests on, especially keep-warm state isolation across a
  tier change.
- **OQ-2 (the composite consent surface).** The matrix (§2) says grants are minted "at
  activation consent, individual never bundled." The *aggregate* picture — the reach view + the
  write-sink consent (`CONNECTOR_EGRESS_FIXING §2.1`) + per-member revoke — is `REPORTING §6`
  D6/RB-6 and unvalidated (the E3 study). Where does the per-realm minting story meet the
  aggregate consent UI? Likely: D6 owns the surface, this spec owns what each consent *grants*.
- **OQ-3 (dogfooding recursion, `ARCHITECTURE_PLAN §0.2` S6).** Running the real four-realm
  composite *in-platform* needs this topology built — the recursion. Confirm the in-platform
  host can express a multi-appKey composite launch before M3, or the dogfooding of the live app
  waits on it.
