# immediately.run Holdout Redacted-Mount View — host-enforced train/holdout separation for inferred formulas

**Status:** proposal / draft — the D9 M0 design-sprint output of `../ARCHITECTURE_PLAN.md` §9. **Re-scoped by adversarial-review-2 (2026-07-09):** this mechanism closes the *trivial* direct-read leak (H3) but does **not** make example-based holdout a correctness proof — the **test-oracle channel** (§5.1) and affine-formula reconstruction (§5) defeat that. Per the user decision, holdout is a **best-effort regression/tripwire**; the load-bearing correctness signal is metamorphic + property + mutation (`ARCHITECTURE_PLAN §6`). Design only; nothing here is built. · **Updated:** 2026-07-09

> **The single implementation-status source for this spec is
> `docs/status/HOLDOUT_REDACTED_MOUNT_STATUS.md`** (to be created when build starts) —
> where this document and that one disagree, the status doc governs.

> **Reads first:** `../ARCHITECTURE_PLAN.md` §6 (testing / infer-then-fortify),
> §8 (assistant realm, `rw@self`), §3.4 (fixtures), and `ADVERSARIAL_REVIEW_1.md` H3;
> `../reckoner_research_report_v2.md` RQ-D4/D5 (holdout is the only example-based
> correctness weight; fixtures inferred-from certify nothing); `UI_AS_APPS_SPEC.md` §8.15
> (attenuated delegation, downward-only), §8.7 (mount rule-sets); `EDITOR_FIRST_EDITING_SPEC.md`
> §3.1 (`capDir`/`capFile` narrowing a held grant with no consent prompt); `SECRETS_SPEC.md`
> §6 (use-not-read, the analogue for "author-declares-where, host-resolves-value").

---

## 0. The problem, precisely  *(normative intent)*

Reckoner's mainline authoring workflow is **infer-then-fortify** (plan §6): the assistant
infers a formula from observed data, then the platform withholds a slice of rows and emits
them as `specification` tests — the **only example-based tests that carry correctness
weight** (fixtures a formula was *fit to* are green by construction, RQ-D4). Two mechanisms
were declared "harness-enforced, not prompt discipline": **holdout** (the agent must not see
the withheld rows) and **blind second-agent authoring** (a test-writing agent must not see
the implementation or fitting data).

**Adversarial-review-1 H3 showed neither is enforced.** The assistant realm holds
`worktree:rw@self` over the document, and the document *contains* `fixtures/`. An agent that
can `readFile('fixtures/orders.frame.json')` can read the withheld rows directly. "The
harness withholds a slice from you" is not a property `rw@self` permits — it is prompt
discipline mislabeled as enforcement, and prompt discipline over a standing read grant
erodes. This spec closes **that** leak.

> **What this spec does NOT do (adversarial-review-2, load-bearing scope correction).** Path
> separation closes the *filesystem read* — but the agent does not need to read the file. It
> **authors the formula and the assertion that run over the holdout inside the engine, and
> reads their result** (§5.1, the test-oracle channel). Holdout is therefore **not** a
> correctness proof and is re-scoped to a best-effort **tripwire**; the real correctness signal
> is the oracle-free legs (`ARCHITECTURE_PLAN §6`). This spec is still worth building — the
> trivial read and the metadata-probe leaks are real and D9 closes them — but it must be
> described as *"the agent cannot trivially read the holdout,"* never *"holdout certifies the
> formula."*

**The core move:** holdout is not "ask the agent not to peek." It is a **host-enforced
separation of *who can read which path*** — the held-out rows live at a path the assistant's
*authoring read view does not cover*, and are resolved into test evaluation only by the
**engine's host-brokered input injection** (which the assistant cannot intercept). The agent
*names* the holdout fixture in a test cell's `inputs`; it never *reads* its bytes. This is
the same shape as `SECRETS_SPEC §6` (declare-where, host-resolves-value) and the same
machinery as `§8.15` attenuated delegation — not a new trust primitive.

---

## 1. Two fixture origins, only one of which is holdout  *(normative)*

The distinction the design turns on — the assistant may freely read fixtures it *captured*;
it must never read fixtures the *host withheld*:

- **Captured fixtures** (assistant-initiated freeze, plan §5.4/§8.2, gated): the assistant
  sees these rows *because it captured them from data it could already read*. They are
  regression/`characterization` material and carry **no** correctness weight. Readable under
  `rw@self` — no redaction needed, and redacting them would be theater.
- **Withheld (holdout) fixtures** (host-initiated split during inference): the host carves a
  random slice of the inference dataset **before the assistant ever receives it**, writes it
  to a **holdout store the assistant is not granted**, and emits `specification` test cells
  referencing it. These carry the correctness weight and **must be unreadable** by the
  authoring agent.

The load-bearing consequence: **inference is a host-mediated operation, not a raw read.**
When the assistant infers "a formula over feed `orders`," the host serves it the **training
split only**; the full dataset is never at a path the assistant can `readFile`. Holdout is
not "attenuate a view the agent already used" (too late — it would have read everything); it
is "the agent's inference input was *never* the full set, and the complement lives where the
agent has no scope."

## 2. The mount topology  *(proposal — owned by D9)*

Three read scopes over one document, minted host-side, reusing `scopedFs` rule-sets (§8.7):

```
document root (backing fs)
  worksheets/            ← assistant: rw   | engine: r (host-injected) | 2nd-agent: —
  templates/             ← assistant: rw   | engine: r                 | 2nd-agent: —
  fixtures/              ← assistant: rw   | engine: r                 | 2nd-agent: —
  reckoner.json          ← assistant: rw   | engine: r                 | 2nd-agent: intent only
  .holdout/              ← assistant: —    | engine: r (injection only) | 2nd-agent: —
      orders.holdout.frame.json            (host-written; never in the assistant's rule-set)
```

- **`.holdout/` is a distinct scope the assistant's rule-set never includes.** By
  `classifyPath` (longest-prefix over the granted `ScopeRule[]`), a path under `.holdout/`
  classifies `none` for the assistant → `ENOENT`/`forbidden`. No new rule *kind* (no
  "deny") is needed — absence from the allow-list is the enforcement, exactly as an
  ungranted sibling space is unreachable today.
- **The engine reads holdout only via host-brokered input injection** (plan §4.1): the
  engine does not `readFile` the mount for cell inputs — the scheduler resolves a test
  cell's declared `inputs` to immutable snapshots and injects them. `fixtures.orders_holdout`
  resolves, host-side, to `.holdout/orders.holdout.frame.json`. The engine holds no egress,
  so holdout data reaching the engine cannot leave (it is already M3-tainted and starved).
- **The second-agent (blind authoring) scope** is narrower still: `reckoner.json` +the target
  cell's **`doc` (stated intent) only** — not `worksheets/` (implementation) and not
  `fixtures/` (fitting data). Same allow-list mechanism, a tighter rule-set.

## 3. The readdir-leak subtlety — why `.holdout/` must sit outside every granted subtree  *(normative — the one non-obvious correctness point)*

`scopedFs` synthesizes a directory listing for a **strict ancestor** of a grant
(`synthesizedChildren`, §8.7): reading a granted subtree's *parent* returns the granted
children. This is a **metadata leak surface** for holdout: if `.holdout/` were a child of a
path the assistant can list (e.g. under `fixtures/`), a `readdir('fixtures')` could reveal
the holdout entry's **existence and name** even though its contents are unreadable — and the
name/row-count alone can leak (how many rows were held out, which feed). Two rules close it:

1. **`.holdout/` is a top-level sibling, never nested under a granted subtree**, so it is
   never a child in any listing the assistant can synthesize (`synthesizedChildren` only
   emits the granted children of an ancestor, and `.holdout/` is granted to no assistant
   rule → never emitted).
2. **The assistant's root grant is enumerated, not `{subtree:'/', mode:'rw'}`.** A
   whole-root `rw` grant makes the document root an ancestor of `.holdout/` and would
   synthesize it into a root `readdir`. So the assistant's rule-set is the **explicit set of
   authoring subtrees** (`worksheets/`, `templates/`, `fixtures/`, `reckoner.json`), never
   the bare root — and `.holdout/` is simply not among them. (This is a narrowing of
   `rw@self`, minted downward-only per §8.15; the app never had a legitimate reason to read
   its own `.holdout/`.)

Gate test G-HRM-3 asserts that `readdir` **and `exists`/`stat`** at every level the assistant
can reach never reveal a `.holdout` entry.

### 3.1 The `scopedFs` filter must be deny-by-default at the method level  *(normative — review-2 CODE-GAP A/B)*

Review-2 found the readdir closure necessary but **not sufficient**, because `filteredFs`
today filters **only** methods in `WRITE_METHODS ∪ PATH_ARGS`; any *other* method returns the
raw backing method bound to the un-classified path (`bind(target)`). `exists`/`existsSync` is
not in that set, so `exists('/.holdout/…')` reaches the raw backend and returns `true` — a live
existence oracle that defeats the whole point, and if the ZenFS backend exposes a path-taking
`openFile`/`readlink` (also unmodeled) the same passthrough yields **file bytes**. Two
mandatory changes, both **fail-closed**:

1. **Deny-by-default:** any path-bearing or unmodeled fs method must be classified (and throw
   `ENOENT`/`EACCES` for a `none` path) or **rejected outright** — never `bind(target)` on an
   un-classified path. The allow-list of pass-through methods must be explicit and exclude
   everything that takes or leaks a path (`exists`, `stat`, `openFile`, `readlink`, …).
2. **Never fail open on an empty rule-set:** `filteredFs` currently pushes `{subtree:'/',
   mode:'rw'}` for an empty rule-set and short-circuits all filtering (`wholeRw`). The assistant
   realm must never be minted with an empty or bare-root rule-set, and the primitive must treat
   an empty rule-set as **deny-all**, not allow-all — so a single mis-mint cannot expose
   `.holdout/`.

These are gate tests G-HRM-2 (extended to `exists`/`stat`/`openFile`) and a new **G-HRM-7**
(empty rule-set → deny-all). Until they hold, D9 does not even close the metadata leak.

## 4. When is the assistant in the redacted view? — the mode is host-driven and un-escapable  *(normative)*

The enforcement is only real if the assistant cannot flip back to an unredacted view
mid-inference. Three rules:

1. **The redacted view is the assistant realm's *standing* mount grant, not a mode it
   enters.** The assistant realm is *always* minted with the `.holdout/`-excluding rule-set;
   there is no un-redacted profile to escape to. `rw@self` is defined, for this realm, as the
   enumerated authoring subtrees — full stop. (H3's error was treating `rw@self` as
   whole-document; D9 defines it as the authoring subtrees.)
2. **The split is host-performed and pre-agent.** The host carves train/holdout at inference
   start from data the assistant has *not yet* received; the assistant's inference input is
   the training split only (§1). There is no window in which the agent held the full set.
3. **Re-derivation is host-controlled.** Re-splitting (a new inference run) re-randomizes
   host-side; the assistant cannot request "the holdout rows" through any API — there is no
   method that returns them, and the fixture path is unreadable. The only thing that ever
   consumes them is engine test-cell evaluation.

**The pre-agent-split precondition, and when it fails (review-2 D9-4 — resolving the old §4.2
vs OQ-2 contradiction).** Rule 2 holds *only* when the host controls the data before the agent
sees it. It does **not** hold in two mainline cases, and the design must detect them rather than
assert a guarantee it lacks:

- **Capture-then-infer:** the assistant's fixture-capture freeze (`ARCHITECTURE_PLAN §5.4`)
  reads feed rows into agent-readable `fixtures/`. If a formula is later inferred over a feed the
  agent already captured, the "holdout" is a subset of already-seen rows — no enforceable split.
- **Static feeds (an uploaded CSV):** there are no fresh rows to withhold; once the agent can
  read (or capture) the dataset, holdout is unenforceable *in principle*.

**Rule:** the host tracks whether the agent has had a read path to a feed's rows; if it has, an
inference over that feed is marked **no-enforceable-holdout**, the emitted `specification` test
is flagged accordingly, and the review surface **down-weights it to zero correctness credit**
(it may still serve as a regression tripwire). Holdout credit is granted *only* for a
host-fetched, never-agent-seen split. This makes §4.2's guarantee conditional and honest instead
of absolute — and it is why the correctness weight lives in the oracle-free legs (§5.3), which do
not depend on any pre-agent window.

### 5.1 The test-oracle channel — why holdout is a tripwire, not a proof  *(normative — the load-bearing residual)*

Path separation guards the door the agent does not need. The agent **authors the test cell
that runs over the holdout** (`inputs: { rows: "fixtures.orders_holdout" }`, a subject formula
it wrote) and **reads that cell's result** — and every result surface is a read of the held-out
rows:

- **Trace-replay** (`ARCHITECTURE_PLAN §4.3`) records "declared inputs → intermediates →
  output" as the primary agent-facing debugging surface. A test cell's declared inputs over
  holdout **are the held-out rows**, handed to the agent verbatim. This is a *literal read*.
- **Failure diagnostics** ("expected 0, got 48120") leak the exact held-out aggregate in one
  run.
- **Pass/fail bisection:** `expectClose(holdout_aggregate, X, {rel:1e-6})` is a comparator
  oracle; the agent packs hundreds of assertions into one full-workbook run (tests are cells,
  one tool call) and bisects each value out.

The "M3-tainted and starved" backstop (§2) does **not** close this: the engine's egress
starvation stops holdout leaving *over the network*, but the result must flow engine → host →
**assistant review surface** (`ARCHITECTURE_PLAN §8.3` requires showing "formula + tests +
result"). And for **clean-tier fixtures — the mainline shareable-workbook case** — the trace is
not even tier-suppressed. There is a dilemma the design cannot escape: if results *were*
tainted enough to suppress, reading them would taint the assistant every authoring iteration
and break the loop; if not, the oracle is open. **D9 does not close the test-oracle channel,**
and a bandwidth-bounded output-channel policy over all test results/traces/diagnostics was
considered and rejected (bigger than path separation, still beaten by §5's reconstruction).
Hence: holdout is a **tripwire** (a later edit that breaks a held-out row is a useful
regression signal), never a certification.

### 5.2 Reconstruction is central for the target workload  *(normative — honesty)*

The earlier draft filed reconstruction as an adversarial corner. It is the **center**: for the
**affine/aggregate/lookup formulas Reckoner explicitly targets** (`ARCHITECTURE_PLAN §7.1`
single aggregates; `sum`/`join`/`groupBy`), the training split *determines* the holdout outcome
by **ordinary fitting** — no adversarial modeling, no distribution work. Two training rows fix a
linear formula; the holdout is fully predicted. Holdout has teeth only on
nonlinear/regime-shift formulas, which are *not* the scoped workload. So even a *perfectly
sealed* mechanism proves ~0 bits for the dominant shape.

### 5.3 The honest claim  *(normative intent)*

D9 closes the **trivial** leaks — the direct `readFile` (H3) and the metadata-probe
(`exists`/`stat`, §3 + the deny-by-default rule below). It does **not** close the test-oracle
channel (§5.1) and adds little for low-parameter formulas (§5.2). Therefore holdout is a
best-effort **tripwire**, the review surface must not promote a holdout-only cell to
"validated," and the load-bearing correctness signal is the oracle-free legs
(metamorphic/property/mutation, `ARCHITECTURE_PLAN §6`), which need no hidden data and no oracle.
Blind second-agent authoring carries the additional D9-3 limit (§7): agent-1 authors the `doc`
agent-2 reads, so a complete intent over-determines the implementation and "independence" is a
weak signal. A compromised *host* is out of scope (it mints the grants); D9 defends against an
over-eager or compromised *assistant*, and only against the trivial read.

## 6. Load-bearing assumptions & code anchors

### Depends-on-today (verified against code 2026-07-09; re-checked by `scripts/check-spec-anchors.mjs`)

| Assumption (existing behavior the design rests on) | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| A mount grant is a rule-set of `{subtree, mode}`; a path outside all rules is unreachable | `immediately-run-site-main/src/filesystem/scopedFs.ts` | `classifyPath` |
| An ancestor `readdir` is synthesized to only the *granted* children (the §3 leak surface) | `immediately-run-site-main/src/filesystem/scopedFs.ts` | `synthesizedChildren` |
| A held grant is narrowed downward-only when delegated (chroot inside the caller's subtree; escape → fail-closed) | `immediately-run-site-main/src/editor/task/attenuateDelta.ts` | `DelegatableMount` |
| The assistant reads the mount via the SDK fs port (`readFile`) — the surface D9 narrows | `immediately-run-sdk/src/fs.ts` | `sandboxFs` |
| Secret values are declared-where / host-resolved, never read by the app (the §0 analogue) | `immediately-run-site-main/src/registry/netFetchPolicy.ts` | `injectSecret` |

### Must-establish (new invariants the implementation creates)

| New invariant | Proven by (gate test) |
|---|---|
| The assistant realm's `rw@self` is the enumerated authoring subtrees, never whole-root | G-HRM-1: the assistant's minted rule-set contains no `{subtree:'/'}` and excludes `.holdout/` |
| A held-out fixture is unreadable AND un-probeable by the assistant | G-HRM-2: `readFile`/`exists`/`stat`/`openFile`('.holdout/…') (and any traversal) from the assistant all return `none`/`ENOENT` under `rw@self` (review-2 CODE-GAP A) |
| Holdout existence/name does not leak via readdir OR metadata | G-HRM-3: `readdir` **and `exists`/`stat`** at every assistant-reachable level never reveal a `.holdout` entry |
| The engine resolves holdout for test cells without an assistant-visible path | G-HRM-4: a `specification` test cell over `fixtures.orders_holdout` evaluates in the engine; the same name read from the assistant fails |
| Holdout credit only for a host-fetched, never-agent-seen split | G-HRM-5: an inference over a feed the agent has read/captured is marked no-enforceable-holdout and down-weighted to zero correctness credit (review-2 D9-4) |
| Blind second-agent scope is intent-only | G-HRM-6: the second agent can read the target `doc` but not `worksheets/` or `fixtures/` |
| The fs filter is deny-by-default; an empty rule-set denies all | G-HRM-7: an unmodeled path-bearing method throws; an empty/mis-minted rule-set exposes nothing (review-2 CODE-GAP B) |
| Holdout does not promote a cell to "validated" | G-HRM-8: a cell whose only non-characterization coverage is a holdout `specification` test renders as *not validated*; "validated" requires a metamorphic/property leg or a passing mutation score (review-2 D9-1) |

## 7. Decisions & rejected alternatives

- **Path-level separation (holdout at an ungranted `.holdout/` scope), reusing `scopedFs`
  allow-list + `attenuateDelta`.** *Rejected:* **within-file row-level redaction** (return
  only the training rows of `fixtures/orders.frame.json`) — it needs a new content-aware fs
  filter, is format-specific (frame JSON, CSV, …), and is far more fragile than "the bytes
  live at a path you don't have"; path-level reuses the exact machinery that already gates
  ungranted spaces.
- **`rw@self` for the assistant realm is *defined* as the enumerated authoring subtrees.**
  *Rejected:* treating `rw@self` as whole-document and bolting on a redaction pass (the H3
  hole — a whole-root grant makes `.holdout/` an ancestor-listable child and invites the
  readdir leak); a "deny-rule" kind in `scopedFs` (absence from the allow-list already
  denies; a deny-rule adds a second code path to keep consistent).
- **Holdout resolved only by the engine's host-brokered input injection.** *Rejected:*
  granting the engine a broad fixture read that the assistant could ride; handing holdout to
  the assistant "sealed" (any in-agent seal is defeatable by the agent).
- **Host-performed, pre-agent split.** *Rejected:* letting the assistant perform the split
  (it would see the rows first — the whole hole); attenuating *after* the agent read (too
  late).
- **Re-scope holdout to a best-effort tripwire; the oracle-free legs carry correctness
  (review-2 decision, §5.3).** *Rejected:* keeping holdout as "the only example-based
  correctness weight" (the test-oracle channel §5.1 and affine reconstruction §5.2 defeat it);
  a bandwidth-bounded output-channel policy over all test results/traces/diagnostics to save it
  (bigger than path separation, still beaten by reconstruction); dropping holdout entirely (the
  tripwire and the trivial-read/metadata-leak closures are still worth D9's cost).
- **Deny-by-default fs; empty rule-set denies all (review-2 §3.1).** *Rejected:* the current
  fail-open method allow-list (`exists`/unmodeled methods pass through) and the empty-rule-set
  `wholeRw` short-circuit — both invert defense-in-depth.
- **Blind second-agent authoring is a *weak* signal (review-2 D9-3).** *Rejected:* claiming
  independence when **agent-1 authors the `doc` agent-2 reads** — a complete intent
  over-determines the implementation, so "independent reproduction from intent" is only as
  independent as the doc is incomplete, which the design cannot enforce. Treat second-agent
  tests as corroboration, not proof.
- **Name the reconstruction residual; keep metamorphic/mutation as the load-bearing signal.**
  *Rejected:* claiming holdout makes inferred formulas correct (RQ-D5 says nothing does);
  claiming path separation defeats a distribution-modeling agent (it doesn't — and for the
  target workload it doesn't even defeat *ordinary fitting*, §5.2).

## 8. Open questions

- **OQ-1 (split granularity).** Row-level random holdout is assumed; some feeds want
  *stratified* holdout (hold out a whole cohort/month so the test checks generalization
  across a dimension). Does the host split API expose a stratification key, or is that a
  future add? Interacts with the case-study cohort sheet.
- **OQ-2 — RESOLVED (review-2 D9-4, §4).** Capture-then-infer and static feeds have no
  enforceable holdout; the host marks such inferences *no-enforceable-holdout* and the review
  surface grants them zero correctness credit (tripwire only). No longer open.
- **OQ-3 (largely answered by review-2; residual for build).** Reconstruction was shown
  *central*, not a corner (§5.2), and the response is the re-scope, not a stronger seal. The
  residual for the build: for which — if any — feed/formula shapes is holdout worth the machinery
  at all (nonlinear/regime-shift formulas), versus dropping it and relying wholly on the
  oracle-free legs? Settle during M2 against the case study; the mandatory-second-agent gate
  (report RQ-D5 threshold) now attaches to a low mutation score, not to a holdout number.
