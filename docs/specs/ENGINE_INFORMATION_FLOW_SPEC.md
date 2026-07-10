# immediately.run Engine Information-Flow — the epoch × tier × egress-channel contract

**Status:** proposal / draft — **Spine 1** of the up-front-design triage
(`../ARCHITECTURE_PLAN.md` §0.1). The unifying contract the per-channel specs
lacked: **both adversarial-review-2 BLOCKERs (the D9 test-oracle channel and the recalc
mixed-epoch glitch) were failures of *composition* across channels reasoned about in
isolation** — this spec makes the composition explicit. Reckoner-internal; design only,
nothing built. · **Updated:** 2026-07-09

> **The single implementation-status source for this spec is
> `docs/status/ENGINE_INFORMATION_FLOW_STATUS.md`** (to be created at build) — where they
> disagree, the status doc governs.

> **Reads first:** `../ARCHITECTURE_PLAN.md` §4 (the engine), §4.2 (scheduler,
> tier fold, common-epoch barrier), §4.3 (diagnostics, trace-replay), §5.2 (frame
> publication), §5.4 (freeze); `HOLDOUT_REDACTED_MOUNT_SPEC.md` §5.1 (the test-oracle channel
> this must govern) + §5.3; `../ADVERSARIAL_REVIEW_2.md` §B (D9-1) and §C (C-R-B);
> `TRUST_MODES_SPEC.md` §3 (M0–M3 tiers), §4 (personal/shared). Sibling: `CONNECTOR_EGRESS_FIXING_SPEC.md`
> (the connector's egress is the *other* controlled boundary; this spec is the engine's).

---

## 1. The one principle  *(normative)*

The formula engine is the **executor** realm: it computes over possibly-M3 data and **holds
no capabilities**. Its safety rests entirely on what may cross its boundary. So:

> **Every value that leaves the engine is a controlled channel, and each channel declares —
> and the host enforces — four properties: its `epoch`, its `tier`, its `audience`, and its
> `bandwidth`.** There is no "incidental" egress: a rendered result, a diagnostic record, an
> evaluation trace, a frozen fixture, and a test pass/fail are *all* channels, and each is
> governed by the same four-property contract.

The review-2 failures were the direct consequence of *not* stating this: the D9 spec governed
the **file** channel (holdout unreadable) while the **trace** and **verdict** channels — which
carry the same holdout rows to the same agent — went ungoverned (D9-1); and the recalc design
governed the **cell→cell** epoch (atomic pair) while the **result** channel to a subscriber
assembled inputs from different epochs (C-R-B). One contract over *all* channels prevents both.

## 2. Epoch — the freshness/consistency stamp  *(normative)*

- **Definition.** Each feed/param snapshot the host admits carries a monotonic **epoch** (a
  per-source generation counter; the global order is the vector of per-source epochs). A
  derived value is computed *from* a specific set of input epochs.
- **Common-epoch barrier (the glitch-freedom rule, `ARCHITECTURE_PLAN §4.2`).** A cell
  publishes only at the greatest epoch `k` for which **every transitive input has a landed
  result**; faster arms are held to `k`. No downstream value ever mixes epochs of a shared
  ancestor.
- **Epoch is carried on every result record and every derived channel** (§4). A late-landing
  async result from a **superseded** epoch is **dropped, not published** — including on the
  diagnostic and trace channels (a trace of a superseded evaluation is marked `superseded`,
  never replayed as current).
- **Cost, stated (`ARCHITECTURE_PLAN §4.1/§5.3`):** a cell's freshness equals its slowest
  transitive path, `critical-path-depth · max(c,e)`. Glitch-freedom is chosen over per-cell
  freshness (the two are mutually exclusive under a continuous feed); this spec is the reason
  the choice is coherent across *all* channels, not just cell→cell.

## 3. Tier — the trust label  *(normative)*

- **`tier = floor` (greatest lower bound) over transitive input tiers**, computed as a second
  product of the same traversal that computes the value (`ARCHITECTURE_PLAN §4.2`, RQ-B4).
- **`(value, tier)` is one atomic record** on every channel; a subscriber never sees a value
  from one epoch/tier paired with a label from another (§4.2 F4). Early-cutoff equality is over
  the pair `(value-hash, tier)` — never value alone (no tier laundering).
- **Tier is host-authoritative**, from the mount tier (`TRUST_MODES §4`); content may not
  self-declare an output tier, and a file's tier tag is advisory display metadata only
  (`ARCHITECTURE_PLAN §5.4`, review-1 L1). **No channel may emit a value at a tier below its
  inputs' floor** — the invariant every channel in §4 inherits.

## 4. The channel inventory — the contract table  *(normative — the heart of this spec)*

Every engine-boundary channel, with its four properties. "Audience" is *who may read the
payload*; a channel's audience **never** includes a principal from which its `tier` or its
holdout-scope should hide it (§5).

| # | Channel | Direction | Epoch-stamped | Tier-carried | Audience | Bandwidth bound |
|---|---|---|---|---|---|---|
| C1 | **Result** (rendered cell value) | engine → host result channel → report view | yes; **common-epoch barrier** (§2) | yes; `(value,tier)` atomic | **viewer** (+ author) | full (the value is the product) |
| C2 | **Diagnostics** (errors, logs, timings) | engine → host → **authoring only** | yes; marked `cancelled`/`superseded` if from a dropped epoch | inherits the evaluation's tier | **author only**, never shared-view | typed, fixed-size, **rate-capped + sampled** (covert-channel bound, RQ-D2) |
| C3 | **Trace-replay** (declared inputs → intermediates → output) | engine → host → author / assistant | yes; superseded traces never replayed | inherits the evaluation's tier | author / assistant — **excluding the authoring agent when the trace's declared inputs are holdout-scoped** (§5) | same caps as C2; **holdout-derived traces are suppressed to the assistant** |
| C4 | **Test verdict** (pass/fail + assertion diff) | engine → host → review surface → assistant | yes | inherits the subject's tier | review surface (human) + assistant — **but reduced to a boolean, and to validated/pinned status not the numeric diff, when the subject's inputs are holdout-scoped** (§5) | **bandwidth-bounded for holdout subjects** (defeats the bisection oracle, review-2 D9-1) |
| C5 | **Frozen fixture / published frame** | engine or connector → mount | capture epoch recorded (provenance) | **refloor at write** (D4), host-enforced; file tag advisory | document readers | full, but a durable write — gated + tier-consequenced (§5.4) |
| C6 | **Param write-back** (widget → input cell) | report view → host → engine | mints a new epoch; **conflated** keep-latest (F8) | n/a (input) | engine | conflated to human/feed rate |

**Reading the table:** C1/C6 are the live loop; C2/C3/C4 are the authoring/debug surfaces; C5
is durability. The two review-2 BLOCKERs are the two shaded cells: **C3/C4's audience-exclusion
for holdout-scoped payloads** (the D9 fix, generalized from "hide the file" to "govern the
channel"), and **C1's epoch stamp + common-epoch barrier** (the recalc fix, generalized from
"cell→cell" to "the result channel to a subscriber").

**Not a channel — view-layer events.** A viewport/container **resize** or a **device-pixel-ratio**
change (which drive responsive template adaptation, `ARCHITECTURE_PLAN §3.3.1`) are **pure
report-view events**: they re-lay-out and re-render components from data already delivered on C1,
and they **never re-enter the engine** — no C1 re-emit, no C6 write, no recompute. Only a
`params` change (C6) recomputes. This keeps responsiveness entirely in the view realm, off the
engine boundary and the tier fold.

## 5. The assistant is an audience — the holdout fix, generalized  *(normative)*

`HOLDOUT_REDACTED_MOUNT_SPEC` closed the **file** channel and missed C3/C4. The general rule
this spec states once, for all channels:

> **A channel whose payload derives from holdout-scoped inputs must not carry that payload to
> the authoring assistant at a bandwidth that reconstructs the held-out values.** The `.holdout/`
> path is one instance (C5-read, closed by D9's mount separation); the trace (C3) and the test
> verdict (C4) are the instances D9 missed, closed here:
>
> - **C3 (trace):** a trace whose declared inputs include a holdout-scoped fixture is **not
>   delivered to the assistant** (it may still serve host-side debugging with no agent in the
>   audience). The agent authoring a test over holdout gets pass/fail status, never the
>   input-echoing trace.
> - **C4 (verdict):** a test verdict whose subject reads holdout is **reduced** for the
>   assistant to the review-surface status (`validated`/`pinned`) — **not** the numeric
>   assertion diff, and **rate-bounded** so a bisection (author a comparator, read pass/fail,
>   narrow) cannot recover the value across runs.

**Honest limit (carried from `HOLDOUT §5`):** this raises the oracle's cost; it does **not**
make holdout a correctness proof (the agent still sees the *training* split and, for affine
formulas, that determines the outcome). Holdout stays a **tripwire**; the load-bearing
correctness signal is the oracle-free legs. This spec's job is only to stop C3/C4 from being a
*trivial* leak the way the file channel was — i.e. to make the mount-separation effort not
pointless.

## 6. Glitch-freedom is a publication rule for all channels — the recalc fix, generalized  *(normative)*

The atomic `(value, tier, epoch)` record and the common-epoch barrier are **publication rules
that govern every channel in §4, not only cell→cell edges**:

- A **subscriber** (C1) receives `D@k` only when the barrier is satisfied — never `D` computed
  from `B@e1 + C@e2` (review-2 C-R-B).
- A **trace** (C3) or **diagnostic** (C2) of a superseded epoch is dropped, so replay never
  reconstructs a phantom or mixed-epoch evaluation.
- A **frozen frame** (C5) records the epoch it captured, so a later "what did we report last
  quarter" (Spine 3 reproducibility) has a consistent cut.

This is why Spine 1 is a *contract*, not a scheduler detail: the barrier is meaningless if one
channel honors it and another doesn't.

## 7. Load-bearing assumptions & code anchors

### Depends-on-today (verified 2026-07-09; re-checked by `scripts/check-spec-anchors.mjs`)

| Assumption (existing behavior the design rests on) | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| Host mount tier is authoritative; the app does not self-declare it | `immediately-run-site-main/src/filesystem/scopedFs.ts` | `classifyPath` |
| An app's fs egress is host-mediated (the surface an audience filter attaches to) | `immediately-run-sdk/src/fs.ts` | `sandboxFs` |

*(This is mostly a new contract; the table above is deliberately short — most invariants are
Must-establish, not Depends-on, and are flagged as proposed rather than asserted as existing.)*

### Must-establish (new invariants the implementation creates)

| New invariant | Proven by (gate test) |
|---|---|
| Every engine-boundary channel carries `(value, tier, epoch)` | channel-contract test: each of C1–C6 emits the triple; a payload without it is rejected at the boundary |
| The common-epoch barrier governs the **result channel to a subscriber**, not only cell→cell | G-EIF-1: a shared-ancestor asymmetric-arm diamond never delivers a mixed-epoch result to a subscriber (review-2 C-R-B) |
| Superseded-epoch results are dropped on **every** channel (result, diagnostic, trace) | G-EIF-2: a late async result / its trace from a superseded epoch is never published or replayed as current |
| No channel emits below the input tier floor | G-EIF-3: a value derived from an M3 input never appears on any channel tagged below M3 |
| Holdout-scoped payloads are audience-excluded on C3 and bandwidth-bounded on C4 | G-EIF-4: an assistant authoring a test over holdout receives no input-echoing trace and cannot bisect the value from verdicts (closes review-2 D9-1) |
| Diagnostics/traces are author-only, never shared-view | G-EIF-5: a shared-view session exposes no C2/C3 payload |

## 8. Decisions & rejected alternatives

- **One contract over all engine-egress channels (epoch × tier × audience × bandwidth).**
  *Rejected:* per-channel specs (the review-2 failure mode — the file channel governed,
  the trace/verdict channels not; the cell→cell epoch governed, the subscriber result not).
- **The assistant is modeled as an *audience*, and holdout is a channel-level exclusion.**
  *Rejected:* modeling holdout only as a *filesystem* property (D9's original framing — the
  agent doesn't need the file, it needs the trace/verdict).
- **Glitch-freedom as a *publication* rule binding all channels, not a scheduler-internal
  property.** *Rejected:* treating the atomic pair as within-cell only (review-2 C-R-B relocated
  the glitch to the publication boundary).
- **Traces/verdicts over holdout are suppressed/reduced, not fully blocked.** *Rejected:*
  blocking all test output over holdout (breaks the authoring loop — the author must see *that*
  a test failed); leaving them at full bandwidth (the bisection oracle). The reduction is the
  middle that keeps the loop while defeating the trivial oracle.
- **Tier stays host-authoritative on every channel.** *Rejected:* trusting a content-declared
  or file-tag tier on any egress (laundering).

## 9. Open questions

- **OQ-1 (holdout-scope propagation).** C3/C4's exclusion keys on "payload *derives from*
  holdout-scoped inputs." That derivation is exactly the tier fold's traversal — so
  **holdout-scope is a lattice label that rides the same fold as tier** (a second bit). Confirm
  it composes (a value touching *any* holdout input is holdout-scoped) and that it does not
  over-suppress ordinary authoring where no holdout is involved.
- **OQ-2 (bandwidth quantification for C4).** "Rate-bounded so bisection cannot recover the
  value" needs a number — how many holdout-subject verdicts per session, before the value's
  entropy is exceeded? Tie to the `HOLDOUT` re-scope: since holdout is only a tripwire, the
  bound can be coarse (a handful of verdicts), not cryptographic.
- **OQ-3 (Spine-2 seam).** The "audience" column names principals (viewer, author, assistant)
  whose *identity* is the Spine-2 capability topology. This spec assumes those principals are
  distinguishable at the boundary; Spine 2 must make that true (the assistant realm is a
  distinct audience from the report view — which needs AA-01/D7).
