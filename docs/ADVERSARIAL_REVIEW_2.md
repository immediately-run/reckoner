# Reckoner — Adversarial Review 2 (third fresh-agent pass)

**Status:** review record — three independent fresh-context passes against the design-sprint
output + the review-1 recalc fixes, 2026-07-09 · **Updated:** 2026-07-09

> The spec-requested third fresh-agent pass (REPORTING_SPREADSHEET §0). Unlike review-1
> (which attacked the plan), this pass attacked **concrete designs with code anchors**:
> `CONNECTOR_EGRESS_FIXING_SPEC` (D2), `HOLDOUT_REDACTED_MOUNT_SPEC` (D9), and the recalc
> liveness invariants review-1 added to close F2/F6. Each reviewer re-verified the code
> anchors independently. Result: **both design sprints and the review-1 recalc fixes carry
> BLOCKERs**, several premise-level. This is the pass working as intended.

## Headline

The recurring structure across all three: **a fix that closed the exact failure it was
written against, and relocated a sibling failure one step away — into a channel the design
never examined.** Egress-fixing fixes *reach* and leaves *write* wide (author-hostile
template + param channel); holdout closes the *filesystem read* and leaves the *test-oracle*
open; the recalc invariants close the *per-cell* failure and leave the *composition* failure
(cross-input epoch skew, live relaunch). Three findings are premise-level: they question
whether the mechanism can do its job, not how it is worded.

---

## A. D2 — Connector egress-fixing (agent verdict: does NOT bound a metacircular connector as claimed)

- **D2-F5 [MAJOR, code gap — my spec claim is false]:** secret-bearing feeds route
  **browser-direct** (`netFetchHandler.ts` — "the value must never hit the server"),
  *bypassing* the built server-side pinning proxy. So the connector's most dangerous feeds
  (the TS-5b `secrets:use`+`net:fetch` combo — the whole reason it's a hazard) get the
  **weakest** egress path, and DNS-rebinding is **not** contained for them. The spec's
  "reuse the built pinning proxy unchanged" and §5 "rebind: contained (built)" are **false
  where it counts.** *(The non-secret path does use the pinned proxy — but its
  backend-unreachable fallback also drops pinning.)*
- **D2-F2 [BLOCKER, spec self-contradiction]:** §2 permits "an opaque cursor the host
  round-trips," but real pagination cursors are **content-derived**, which violates §1's "a
  target is never a function of fetched content." The permitted slot type is an unbounded
  connector-authored channel. The two clauses cannot both hold; closing it needs
  host-minted opaque cursors (API-specific logic into the TCB — breaks the dumb pipe).
- **D2-F4 [BLOCKER for the author persona, scoping hole]:** the design attacks the
  *compromised connector* and trusts "feed config." A **malicious author** declares a POST
  feed to `evil.com` with a cell-reference `bodyTemplate` — egress-fixing faithfully pumps
  the sheet out, and the consent surface frames feeds as read-sources, never revealing a
  write-sink or which cells the body references. Plausibly bigger than the whole
  compromised-connector story; unaddressed.
- **D2-F1 [MAJOR, honesty]:** quantified — an `iso8601` slot drains a 256-bit secret in
  **~6–9 on-cadence requests** the frequency-tripwire never sees; the limiter (`consume`) is
  **per-uid and fails open**; there is **no request-body size cap**. "Bounded param drip"
  massively understates a fast full-secret drain.
- **D2-F3 [MAJOR]:** "the connector never reads the secret" is **header-only**
  (`stripInjectedFromResponse` strips headers, not body); a malicious allowlisted host
  reflects the token in the response **body**, which the connector reads.
- **D2-F6 [contained, verified]:** redirect `manual` + `Location`-stripping means the
  connector never sees `Location` — the "content steers next target via redirect" vector is
  closed. No finding.
- **Code bugs in shipped SSRF blocklist (`netFetch.ts`/`netFetchPolicy.ts`):** IPv6
  link-local is `fe80`-only (misses `fe90`–`febf` = `fe80::/10`); hex IPv4-mapped IPv6
  unmatched. Real, small, platform bugs — file separately.

**Verdict:** reach-fixing (which host/path) is sound and is the right new idea (moves 1/4/8
contained); the *write* axis is mischaracterized on every count, the secret path is off the
pinned proxy, and the author-hostile template is a host-blessed exfil endpoint the spec
omits. The §4/§5 "honest residual" **understates its magnitude** ("consented reach;
write-to-fixed-host at ~unbounded per-request bandwidth, frequency-tripwired only").

## B. D9 — Holdout redacted-mount (agent verdict: does NOT enforce holdout; relocates the leak to an oracle)

- **D9-1 (the test-oracle channel) [BLOCKER, total omission]:** the spec guards the door the
  agent doesn't need. The agent **authors the formula and assertion that run over the
  holdout inside the engine, and reads their result.** Three sub-channels: (a)
  **trace-replay** (§4.3) records "declared inputs → intermediates → output" as the primary
  agent-facing surface — and a test cell's declared inputs over holdout **are the held-out
  rows**, handed to the agent verbatim; (b) a failure diagnostic ("expected 0, got 48120")
  leaks the exact aggregate in one run; (c) pass/fail bisection recovers each value in ~20–40
  runs, hundreds of assertions per full-workbook run. The "M3-tainted and starved" backstop
  **fails**: it stops engine→network egress, not engine→host→**assistant review surface**
  (which §8.3 *requires*), and for **clean-tier fixtures — the mainline shareable case** —
  the trace is not even tier-suppressed. Unresolved dilemma the spec never picks: if results
  were M3-tainted, reading them taints the assistant every authoring iteration (breaks the
  loop); if not, the oracle is open.
- **D9-2 (reconstruction is central, not marginal) [MAJOR, honesty/premise]:** for the
  **affine/aggregate/lookup formulas that are Reckoner's explicit target** (§7.1 single
  aggregates; `sum`/`join`/`groupBy`), the training split **determines** the holdout outcome
  by ordinary fitting — holdout adds ~0 bits, no adversarial modeling needed. Holdout has
  teeth only on nonlinear/regime-shift formulas, which are *not* the scoped workload. §5
  files this as an adversarial corner; it is the **center**.
- **D9-3 (doc-smuggling defeats blind authoring) [MAJOR]:** agent-2 reads only the target
  cell's `doc` — but **agent-1 authors that `doc`**, unconstrained. A complete intent
  over-determines the implementation (that is what a doc is for), so "independent
  reproduction from intent" is not independent. The "strongest lever" (RQ-D5) rests on the
  doc under-determining the implementation — unstated, unenforced.
- **D9-4 (pre-agent split is contradicted by capture) [MAJOR, BLOCKER for static feeds]:**
  §4.2 asserts "no window in which the agent held the full set," but the assistant has
  standing `rw@self` over `fixtures/` and the capture-freeze reads feed rows into
  agent-readable `fixtures/`. Capture-then-infer makes holdout a subset of already-seen rows.
  For a **static feed (uploaded CSV)** there are no fresh rows to withhold — holdout is
  **unenforceable in principle**, and the "down-weight the test" fallback zeroes the only
  correctness-weighted example test. §4.2 and OQ-2 cannot both stand.
- **D9 CODE-GAP A [MAJOR→BLOCKER]:** `filteredFs`/`scopedFs` filter **only**
  `WRITE_METHODS ∪ PATH_ARGS`; any other method returns the **raw backing method with the
  un-classified path** (`bind(target)`). `exists`/`existsSync` is **not** in the set →
  `exists('/.holdout/…')` hits raw backing → **true**: a live existence/metadata oracle that
  falsifies filteredFs's own "no existence oracle" comment and G-HRM-3 (proven only via
  `readdir`, never `exists`/`stat`). If the ZenFS backend exposes a path-taking
  `openFile`/`readlink` (standard, also absent from `PATH_ARGS`), the same passthrough yields
  **file bytes** — direct read. Fix: **deny-by-default** — any path-bearing/unmodeled method
  throws.
- **D9 CODE-GAP B [MAJOR]:** `filteredFs` fails **open** — empty rule-set pushes
  `{subtree:'/', mode:'rw'}` and `wholeRw` short-circuits all filtering. One mis-mint exposes
  `.holdout` fully. Defense-in-depth inverted.
- **Verified sound:** `classifyPath` `none`-classification, `synthesizedChildren` readdir
  closure, `..`/NUL/encoding/case traversal, `attenuateDelta` chroot (the fs-view mode-escape
  is genuinely closed). The path machinery is real and mostly correct — it just guards the
  wrong door.

**Verdict:** D9 relocates the leak from a filesystem read it closes to an oracle/reconstruction
channel it never examines, at least as effective (a literal read via trace-replay), and for
the mainline formula class holdout proves ~nothing even sealed. The residual framing is **not
honest**.

## C. Recalc liveness (agent verdict: F1/F2/F4/F5/F6/F7 NOT sufficient; two live BLOCKERs)

- **C-R-A (live relaunch livelock + memo DoS) [BLOCKER]:** the `(cell, input-hash)` sticky
  memo (my F6 fix) **never hits under a live feed** — every tick is a fresh input-hash — so a
  diverging cell misses the memo, `terminate()`s the single context (tearing down *all*
  in-flight state every `e`), rebuilds, re-demands on a new hash, diverges again: **permanent
  whole-workbook livelock** exactly in the PD-1 full-live regime. Plus: "sticky, no eviction"
  → one entry per distinct diverging input-hash → **unbounded-memo memory DoS**. Fix: a
  **per-cell circuit breaker** (quarantine after N terminations *regardless of input-hash*,
  resolve dependents with error-as-value, require author re-arm) + LRU-bound the memo.
- **C-R-B (cross-input mixed-epoch glitch) [BLOCKER]:** F4's atomic `(value,tier)` is
  *within* a cell; F5's per-input "settle" lets D assemble `B@epoch-1 + C@epoch-2` of a shared
  ancestor A when arms have different eval times (B slow, C fast, feed re-fires while B grinds;
  B@e1 is *not* superseded from B's own view, so the epoch-drop rule doesn't catch it). The
  classic glitch, relocated within-pair → across-inputs. **Structural truth it surfaced:
  per-cell `max(c,e)` freshness (F2) and glitch-freedom (F5) are mutually exclusive on an
  asymmetric diamond under a continuous feed** — the plan currently claims both. Fix: a
  **common-epoch barrier** (D assembles inputs at the greatest epoch for which *every*
  transitive input has landed; faster arms held) — which inherits the staleness of finding 1.
- **C-1 (freshness bound wrong) [MAJOR, honesty]:** the published bound `max(c,e)` is the
  *single-cell* bound; the honest workbook bound is **critical-path-depth · max(c,e)**. My
  "honesty note" was dishonest by one graph dimension. Supersession keeps throughput fine;
  latency `d·max(c,e)` is the irreducible cost of a serial pipeline with `e>c`, and never
  closes while the feed runs.
- **C-3 (sticky verdict poisons flaky timeouts) [MAJOR]:** wall-clock is **not** a pure
  function of `(cell, input-hash)` (depends on machine load, GC, co-scheduled cells), but the
  widened async-wall-clock watchdog verdict is memoized as if it were and made sticky → a
  one-off load-induced timeout **permanently poisons** that input (self-heals on a live feed
  by luck; permanent for static/fixture-driven test cells — the mainline). Fix: split hard
  runaway (circuit-break) from soft budget-exceed (confirm-before-stick via the double-eval
  already run for purity; TTL/backoff, never permanent).
- **C-4 (F1 enumerability hole) [MAJOR]:** in-namespace indirection is genuinely closed, but
  a **`params.*` produced by a cell** (`params.metric ← cellC`) creates a producer edge the
  static SCC misses → the C→params→D→…→C cycle reopens the deadlock F1 claims to close; and a
  **non-literal namespace token** (`candidates: params.whichNs + ".*"`) is not enumerable at
  publish. Fix: assert (a) `params.*` are graph **leaves** (or cell→param binding is a static
  edge in the SCC); (b) namespace tokens are **compile-time literals**, checked at publish.
- **C-6 (F7 monotonicity breaks consent elevation) [MAJOR]:** §3.3 *invites* a mid-session
  tier **rise** (unconsented feed → "needs feed access" → user consents → elevated), which F7
  forbids applying until "a new session" (meaningless for a PD-1 live dashboard). All three
  outcomes wrong (silent trust-staleness / UX cliff / full re-mount). Fix: scope F7 —
  monotone for **autonomous** changes (keep termination); **user-consent elevations permitted
  mid-session**, human-rate, surgical in-place subgraph re-mount (O(1)/session, cannot
  oscillate).
- **C-7:** the five E-2 tests certify each fix's happy path and **miss all six findings** —
  same critique review-1 made of the original property test, now true of its replacements.
  Needs: running-feed steady-state freshness on a depth-`d` chain; live-feed divergence with
  bounded-memo assertion; soft-timeout recovery; param-produced-by-cell / computed-namespace;
  and a shared-ancestor asymmetric-async-arm glitch test with a common-epoch assertion.

---

## What this means (three premise-level questions, not just fixes)

Most of these are correct doc-fixes I can apply (the honesty restatements, the freshness
bound, F1 leaf/literal invariants, F7 consent exception, the circuit breaker, the
common-epoch barrier, deny-by-default fs note). **Three are premise-level and need a
decision, because they question whether the mechanism earns its place:**

1. **Holdout may not carry the weight the plan assigned it (D9-1 + D9-2).** The plan §6 calls
   holdout "the only example-based tests carrying genuine correctness weight." The oracle
   channel + affine-reconstruction say that is false for the mainline. Either holdout is
   re-scoped to "regression/tripwire, not correctness proof" and the **metamorphic + mutation
   legs become the stated load-bearing signal**, or D9 grows a real output-channel policy over
   test results/traces/diagnostics (bandwidth-bounded, anti-circularity-preserving) — a much
   bigger mechanism than path separation.
2. **Freshness and glitch-freedom are mutually exclusive under PD-1 (C-R-B).** The plan can
   have glitch-free-but-stale (common-epoch barrier, `d·max(c,e)` lag) **or**
   fast-but-glitchy-with-marking — not both. PD-1 (full-live) forces the choice; it is a real
   architectural decision, not a bug.
3. **D2 must defend the author-hostile template, not just the compromised connector (D2-F4),
   and put secret feeds back on the pinned path (D2-F5).** Both are real redesign, and F4 in
   particular changes the connector consent surface (write-sinks distinguished from
   read-sources) — a platform-UX decision.

The clear doc-fixes and the two shipped-code bugs (SSRF ranges; the `exists`/method
fail-open) I can apply/file now; the three above are yours.
