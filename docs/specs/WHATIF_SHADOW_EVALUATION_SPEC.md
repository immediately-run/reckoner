# Reckoner What-if Shadow Evaluation — an ephemeral counterfactual work area over the starved engine

**Status:** implemented at the deliverable level — the R-6 work-area slice (R3-395…R3-397);
one adversarial pass folded (§11, WIF-R1…R11); residuals live in the status doc. ·
**Updated:** 2026-08-27

*(Implementation note, 2026-08-27 — the design below was authored, adversarially reviewed,
and then built in the same pass: §§1–6 and the §8 gates are normative and shipped; §7 and
§12 remain the honest remainder. The earlier `proposal` markers on built sections were
reconciled in this edit, per spec_style "keep status honest".)*

> **The single implementation-status source for this spec is
> `docs/status/WHATIF_SHADOW_EVALUATION_STATUS.md`** — where this document and that one
> disagree, the status doc governs.

> **Reads first:** `ARCHITECTURE_PLAN.md` §4.1/§4.2 (the worker-backed engine, watchdog,
> supersession), §7.1 (the scope cut this spec re-opens a slice of), risk R-6;
> `REPORTING_SPREADSHEET_SPEC.md` §3.2 (the starved evaluator), §5 (ephemeral compute /
> RS-10 write-laundering); `ENGINE_INFORMATION_FLOW_SPEC.md` (tiering through the engine);
> the platform's `EDITOR_FIRST_EDITING_SPEC.md` (why this is *not* an in-app editor
> violation — its §5 stated-reason rule, satisfied in §6 below).

---

## 0. Charter — the gap and the shape of the fix  *(normative — shipped 2026-08-27)*

`ARCHITECTURE_PLAN §7.1` scoped v1 to *report-authoring and delegation, not ad-hoc
exploration*, and risk **R-6** booked the consequence honestly: the solo analyst has no
place to mess around — no scratch cell, no "what happens if I change this," nothing
between *dragging a declared slider* and *forking the repository*. The Caldera case study
makes the gap concrete: the document itself contains a 25-run sensitivity grid and a
goal-seek — reified exploration — but nothing in the product lets an author ask one
counterfactual question of their own without editing repository files.

This spec fills the *engine-cheap* slice of R-6 with one mechanism and two surfaces:

> **A shadow session**: a second, equally-starved engine instance built over *patched*
> worksheet sources and a pinned snapshot of the live session's state, whose results are
> **rendered, diffed against that pinned baseline, and discarded — never persisted**.

The two surfaces are the **what-if panel** (perturb an existing cell's formula from the
value inspector and watch the downstream neighborhood shift) and the **scratch pad** (an
unsaved, in-memory worksheet — the notebook work area). Both are strictly opt-in chrome
inside existing review surfaces; the report a viewer opens is untouched (value 2).

**What this spec deliberately is not:** it is not the authoring/persistence path (no file
writes, no contribute flow, no "apply" — §7), not the R-6 *tabular multi-cell inspector*
or *range-select-sum* (still open), and not a new realm, capability, principal, service,
or gate (§5).

---

## 1. Product surface  *(normative — shipped 2026-08-27)*

### 1.1 The what-if panel (inspector)

The value inspector (review surface slice 2) gains a **"What if"** section for the
inspected cell:

- an editable **variant** of the cell's formula source, pre-filled with the current
  formula (`CellDescriptor.formulaSource`). A variant replaces the formula *function
  only*; the cell's declared `inputs` are not editable in v1, so variant formulas compute
  over the same declared inputs (an undeclared name is an ordinary evaluation error);
- a **Run** action: pins a coherent baseline (§2.1), builds the shadow session with the
  variant spliced in (§3), runs it over the pinned externals, and runs the shadow test
  suite;
- a result readout: the cell's **baseline → shadow value**, the **downstream delta list**
  (every dependent cell whose value changed, scoped by the dependents closure — §4), any
  **new errors**, and the **test verdicts that flipped**;
- a **Discard** action: shadow results are dropped. Variant *text* is session-scoped
  state (§1.4), so closing the inspector does not silently destroy an edited variant.

The panel is explicit-run (no evaluate-on-keystroke): a run is a full shadow build + pass
+ suite, its browser-side cost is unmeasured, and on the platform today it shares the
main thread (§6) — an explicit action keeps that cost legible and interruptible-by-choice.

### 1.2 The scratch pad (workbook panel)

The workbook panel gains a **"Scratch"** section: one in-memory worksheet source buffer
the author edits freely (cells, tests, cross-sheet inputs — the full worksheet grammar),
plus **Run**. Running builds the shadow session with the scratch module added as an extra
worksheet (§3.2) and displays the scratch cells as ordinary workbook cards — value,
errors, verdicts — in the same visual language as durable cells, but visibly marked
*scratch (unsaved)*.

Scratch **test cells must target scratch subjects**: a scratch test whose `subject` is a
durable cell is refused at shadow-build time with a visible message (§4, WIF-R6). Probing
durable cells with ad-hoc tests is booked as an open question (Q5), not silently allowed.

The scratch pad is the R-6 "ephemeral scratch surface": a notebook-like place to try
things whose semantics are exactly worksheet semantics (named, typed, testable cells)
with the ceremony removed. Promotion to a durable worksheet file is **out of scope** (§7).

### 1.3 Run-mode-first (value 2)

Neither surface adds a pixel to the report view. Both live behind the existing opt-in
doors (the inspector; the workbook panel), which a pure viewer never opens. A static
report opens exactly as before — zero prompts, zero chrome.

### 1.4 Ephemeral results, durable-enough text (WIF-R9)

Ephemeral *results* are a security posture; ephemeral *user-typed source with zero
recovery* would be unhandled data loss. v1 requirements:

- **Buffer text outlives panel visibility.** The scratch buffer and per-cell variant
  texts are session-scoped app state: closing/reopening the workbook panel or inspector
  does not clear them. A page reload does (persistence is booked, §7, with the
  opaque-origin storage constraint named).
- **Explicit Clear, confirmed.** The only way to empty a non-empty scratch buffer is an
  explicit Clear action with a confirm step.
- **Copy affordance.** The scratch pad offers copy-to-clipboard for the buffer text
  (guarded — clipboard access can be absent in the sandboxed iframe; the buffer is a
  plain textarea, so manual select-copy always works as the floor). Copying text touches
  no mount and no RS-10 gate.

### 1.5 Mobile (value 8; WIF-R8)

Honestly scoped rather than omitted: both surfaces ride panels that already stack
full-width on small screens. v1 requires: the variant/scratch textareas render at a
font-size that avoids focus-zoom, Run/Discard/Copy are reachable without dismissing the
keyboard, and the delta list reads as a stacked list (no wide matrix). **Hand-typing
formula code on a phone is not the target interaction and this spec does not claim it
is**: the mobile-complete counterfactual path remains the report's params widgets; the
what-if and scratch surfaces on mobile are functional-but-keyboard-bound, and a
structured (no-code) mobile variant flow is booked value-8 debt (Q6), owned by this spec.

---

## 2. The shadow session  *(normative — shipped 2026-08-27)*

A shadow session is a second `AsyncEngine` over its own transport, built from the
document's worksheet sources with a patch applied, run once over a pinned baseline:

```
shadowRun({
  sources,            // the live session's retained worksheet sources
  patch,              // { variants: Map<cellId, formulaSource>, scratch?: string }
  baseline,           // the pinned { pass, externals } pair (§2.1)
  transport,          // its own transport — never the base engine's
}) → { pass, verdicts, diff, diagnostics }
```

### 2.1 The pinned baseline (WIF-R3)

Under a live feed the base session is a moving target: the feed runtime drives
`engine.update` continuously, a pass **clears** published results at its start, and a
just-written external can sit in the pending slot before any pass adopts it. Diffing a
shadow pass against "the live engine, whenever the shadow happens to finish" would
produce spurious deltas on every feed-derived cell.

So Run begins by capturing a **coherent settled baseline** from the base engine — a new
engine accessor (`settledSnapshot()`, must-establish §9) that:

- awaits quiescence (no pass in flight, no pending externals — the single-slot
  supersession loop makes this a bounded wait);
- returns the settled pass (results + errors) **and** the externals that produced it —
  params, fixtures, *and retained feed buffers* — as one pair;
- **deep-copies the externals** (structured clone; the values are structured-clone-safe
  by construction — they cross the worker boundary). This is not hygiene but a
  correctness/integrity requirement on the in-process path: without it the shadow's
  compartments share live Row/array references with the base engine, and a variant
  mutating an input row corrupts the base session's next pass (WIF-R1).

The shadow runs over the pinned externals; the diff (§4) compares the shadow pass against
the pinned pass — never against the live engine. The readout labels its provenance
("baseline as of the run"). The base session continues advancing underneath; that is
correct and visible, not a race.

### 2.2 What holds today vs what this adds

Load-bearing properties that hold **today** (anchors, §9):

- **Build-from-sources is the engine's only constructor.** The worker protocol's `build`
  message takes raw source text; `AsyncEngine` re-sends builds routinely (watchdog
  restarts). A patched build is a normal build.
- **A pass is already a full recompute.** The engine clears results and evaluates every
  cell in topo order on every pass; there is no incremental machinery a shadow bypasses.
- **The evaluator is starved by construction.** A worksheet compartment is endowed with
  the stdlib and nothing else; a second compartment holds the same nothing. (Authority —
  see §5 for the *integrity* caveat on the in-process path, which is a different axis.)
- **Externals flow host→engine only.** Nothing evaluator-side originates an external;
  params, fixtures, and feed buffers are all host-written. (The *snapshot accessor* is
  new — must-establish, §9 — because feed buffers live only inside the engine, not in the
  session's record.)

New machinery (must-establish, §9): `AsyncEngine.settledSnapshot()` (§2.1); session
retention of worksheet sources, the loaded document, and the runtime-feed list (the
shadow's cross-reference validation needs the same universe the base validation used,
§3.2); `WorkerTransport.dispose()` — terminate without respawn (today's `restart()`
always spawns a successor; a discarded shadow must be able to *stop*).

### 2.3 Cost, honestly (WIF-R7)

A shadow Run is **more** than a params-slider drag: build (fresh compartments per
worksheet + graph/cycle analysis) **+** full pass **+** test suite, where a drag is a
pass only. Its browser-side latency is **unmeasured** — the Caldera document runs today
only in the Node test harness, so no interactivity claim is made here. What is claimed:
the machinery is exercised over the real Caldera document in the harness (G-WIF-9), the
explicit-Run design keeps the unmeasured cost behind a deliberate action, and a browser
measurement is booked as a status-doc item before any continuous-evaluation mode (Q1) is
considered.

---

## 3. Source patching  *(normative — shipped 2026-08-27)*

### 3.1 Formula variants — unique-occurrence splice

A variant for cell `ws.name` is applied by replacing the cell's current formula text in
worksheet `ws`'s source with the variant text. The descriptor's `formulaSource` is the
formula function's own source (`Function.prototype.toString`, preserved by SES), taken
from a compartment evaluation of the worksheet body after a **line-anchored** transform
(§3.3), so for well-formed sheets it is verbatim file text.

The splice is defensive, with typed errors (never a silent wrong patch):

- `formula-not-found` — the descriptor text does not occur in the sheet source (the
  fidelity assumption broke; refuse rather than guess);
- `formula-ambiguous` — the text occurs more than once. This covers **both** the
  identical-formula case **and** the more common substring case: a short formula (`() =>
  1`, `(i) => i.x`) occurring inside a longer one counts as multiple occurrences and is
  refused. **This makes the v1 mechanism honestly partial**: cells with very short or
  duplicated formula text will refuse to splice, with the refusal shown as such in the
  panel. The clean successor — a build-time source span on `CellDescriptor` — is booked
  (§10) and becomes v1.5 the moment refusal rates annoy in practice.

The patched source then goes through the ordinary build path; a variant that no longer
parses or breaks the graph surfaces as the ordinary `build-error` / diagnostics, shown in
the panel.

### 3.2 The scratch module, and cross-reference validation (WIF-R5)

The scratch buffer is added to the build's sources under a reserved worksheet name
(`scratch`). If the document already declares a worksheet named `scratch`, the pad is
disabled with a visible message (collision is refused, not merged; Q2 books the durable
fix). Scratch cells may declare inputs on any durable cell or external; durable sources
are patched only by §3.1 splices of existing formulas, so scratch cells cannot become
inputs of durable cells.

**The shadow build re-runs external cross-reference validation.** Engine builds do not
validate external references — that runs once at document load — and an absent external
resolves to a silent `null`. A scratch cell's typo'd `fixtures.exec_sumary` must not
evaluate to confident nonsense: the shadow path re-runs `validateExternalReferences`
over the shadow engine's `externalReferences()`, against the same universe the base
validation used (document feeds/fixtures/params + runtime feeds + template widget
params), and surfaces the diagnostics in the panel (G-WIF-10).

### 3.3 The transform, corrected (WIF-R4)

The worksheet-to-compartment transform strips the stdlib import line and rewrites
`export const` to `const`. As shipped, both regexes are **unanchored over the whole
body**: the token sequence `export const` inside a formula's string literal or comment
would be rewritten (making `formula.toString()` diverge from file text) and would
simultaneously collect a phantom export name that breaks the build's register call. This
spec requires the regexes be **line-anchored** (a prerequisite fix, G-WIF-1a); the
residual — a string literal containing a newline followed by `export const` — is
accepted and named, since such a sheet already breaks the *base* build today, before any
shadow machinery is involved.

### 3.4 What patching cannot do

No patch may touch the manifest, fixtures, feeds, templates, or params declarations —
sources in, sources out, worksheets only. (Externals counterfactuals — "what if this
fixture leaf were X" — already have a live path via `engine.update` and the paramRefs
machinery; widening *that* into a full externals-override UI is out of scope here.)

---

## 4. Diffing the counterfactual  *(normative — shipped 2026-08-27)*

The what-if result is computed, not narrated:

- **Dependents closure** — a pure reverse-edge walk over `CellDescriptor.deps` from the
  varied cell(s), bounding which cells *can* have changed. (Wildcard inputs are expanded
  into `deps` at build time, so the closure sees them; variants cannot change declared
  inputs (§1.1), so the closure is identical over base and shadow descriptors.)
- **Value diff** — per cell, compare the **pinned baseline pass**'s published
  `contentKey` (a canonical collision-free serialization, not a lossy digest) against
  the shadow pass's; changed / unchanged / newly-erroring / no-longer-erroring.
- **Verdict diff** — run the shadow engine's test suite (`runTests`) and report subjects
  whose verdict flipped (pass→fail is the headline; fail→pass is shown too), against the
  base verdicts already computed by the review surface.

Cells outside the closure are asserted unchanged **and** verified by the same contentKey
comparison in tests (G-WIF-4): topo-order full recompute means an out-of-closure change
is an engine bug, and the gate would catch it.

The scratch surface reuses the same machinery with an empty variants map. For
purely-additive scratch runs the readout is the scratch cells' own
values/errors/verdicts, plus two invariants: **no durable cell's value changed**
(G-WIF-5) and **no durable subject's verdict changed** — guaranteed structurally by
refusing scratch tests on durable subjects (§1.2, G-WIF-6a).

---

## 5. Security & integrity  *(normative — shipped 2026-08-27)*

This spec adds **no new capability, principal, service, realm, or gate**. It does add
the first surface that invites **typed-in arbitrary formula code**, so the confinement
story must be stated per transport, not averaged (WIF-R1/R2):

- **Authority (both transports): starved.** Shadow evaluation runs in SES compartments
  endowed with the stdlib and nothing else — no ambient fetch/DOM/process, same as the
  base evaluator. A user typing a variant into their own session runs code with less
  reach than the devtools console they already hold; Class-A-bounded, browser-parity.
- **Isolation/integrity — real-worker transport (local dev, and the platform once it
  evaluates `import.meta.url`):** the shadow worker is a separate `lockdown()`-ed realm;
  intrinsics poisoning and runaway divergence are contained and terminable
  (watchdog → `terminate()`), and the base session is structurally unreachable.
- **Isolation/integrity — in-process fallback (the platform today): weaker, and this
  spec says so.** The in-process worker runs in the app's own realm, which is **not**
  locked down; compartment starvation still bounds *reachability* (no ambient
  authority), but shared mutable primordials mean a hostile/buggy variant can poison
  intrinsics shared with the base engine and the app UI, and **a synchronously divergent
  variant (`while(true)`) cannot be interrupted at all** — the watchdog is a main-thread
  timer that never fires; the tab wedges until the browser kills it, base session
  included. The same holds for the shadow `runTests` path. **These are named residuals,
  not claims-away**: the deep-copied baseline (§2.1) closes the shared-input-mutation
  hole, which is the deliberately-closable part; the intrinsics and divergence residuals
  are accepted for v1 (the base engine already runs document formulas on this path —
  the marginal exposure is that what-if invites *unreviewed typed* code) and
  self-resolve when the platform gains real workers. Booked alternative — `lockdown()`
  on the main realm — is Q7, with its app-breakage cost to be measured, not assumed.
- **Ephemeral by construction — RS-10 untouched.** Shadow results live in the panel and
  die with it. No persist path, no freeze path, no file write anywhere in this spec; the
  write-laundering surface (`REPORTING_SPREADSHEET_SPEC §5`) gains no new entry point.
  (A user hand-copying a number they can already see is browser-parity, not a write
  path.) The one day a "keep this" affordance exists (§7), it must route through the
  same freeze/contribute gates as any other write — that affordance is out of scope
  precisely so this spec cannot be its back door.
- **Tiering flows through unchanged.** The shadow pass folds tiers exactly as the base
  pass does; a shadow value derived from an M3 feed buffer displays as such. Nothing is
  persisted, so no refloor question arises.
- **Shared-document viewers.** In a future shared context, the what-if panel lets a
  *viewer* run their own formula text over data the report already discloses to them
  (Class A) — the authority they already hold; it discloses nothing new and writes
  nothing. The panel MUST still be absent when the inspector itself is absent for a
  given deployment shape (Q4).

---

## 6. Lifecycle & the editor-first boundary  *(normative — shipped 2026-08-27)*

- **One shadow context per surface instance, reused across runs.** Each Run re-`build`s
  the same shadow context (build replaces worker state); `dispose()` on
  unmount/discard. Run is disabled while a shadow pass is in flight (explicit runs; no
  supersession machinery needed).
- **The platform failure mode is stated in §5, not here-hedged:** on the in-process
  fallback a divergent variant is unrecoverable. The panel shows a running state; that
  is a UX affordance, not a containment claim.
- **Why not the platform editor** (`EDITOR_FIRST_EDITING_SPEC` §5's stated-reason rule):
  the thing being edited **is not a file** — a variant is a counterfactual that must
  never touch the document, and the scratch buffer is an unsaved evaluation context
  whose *content* the user can copy out at will (§1.4). The platform editor's contract
  is editing *files in mounts*; routing an explicitly-never-persisted buffer through it
  would create the very write path this design exists to avoid. The moment either
  surface grows a persistence affordance, that affordance delegates to the platform
  (`edit-file` / contribute) — recorded here as the standing boundary.

---

## 7. Out of scope — the honest remainder  *(normative — the booked remainder, nothing here shipped)*

- **Apply / promote.** Writing a variant back to its worksheet, or a scratch cell into a
  durable sheet, requires a writable mount and the platform editing path
  (`edit-file`/contribute) plus the freeze-gate questions of RS-10. Not in this spec;
  the UI shows *why* (read-only document) rather than a dead button.
- **R-6's other halves.** The tabular multi-cell inspector and range-select-sum remain
  open; this spec closes only the scratch/what-if slice.
- **Externals-override UI** ("what if this fixture were…") beyond the existing params
  path (§3.4).
- **Scratch-text persistence across reloads** — booked, not designed: any later
  persistence must survive the platform's opaque-origin storage constraints (access can
  throw; wrap and degrade) and is *text-only* (never results).
- **Multi-variant compare / sweep UI** (vary a cell across N values): the engine cost
  model supports it (N shadow passes), but the surface is future work (Q3).

---

## 8. Gates  *(normative — the falsifiable exit tests, shipped 2026-08-27)*

| Gate | Test |
|---|---|
| **G-WIF-1** | Splicing a variant into a sheet where the formula text occurs exactly once produces a source that builds; `formula-not-found` (zero occurrences) and `formula-ambiguous` (identical-formula **and** substring cases) are returned as typed errors — never a silent wrong patch. |
| **G-WIF-1a** | The worksheet transform is line-anchored: a formula containing the string literal `"export const x"` builds, round-trips `formulaSource` verbatim, and registers no phantom export. |
| **G-WIF-2** | A shadow run over a variant changes the varied cell and its dependents in the shadow pass while the **base engine's published results are `contentKey`-identical** before/after. On the in-process transport this is additionally exercised with a variant that *mutates its input rows* — the deep-copied baseline (§2.1) keeps the base session's next pass unaffected. |
| **G-WIF-3** | `settledSnapshot()` awaits quiescence and returns a coherent pair: a params write issued before the call is reflected in both the externals and the pass; feed-buffer keys present in the engine are present in the snapshot; the returned externals are copies (mutating them does not affect the engine). |
| **G-WIF-4** | The value diff reports exactly the cells whose `contentKey` differs between the **pinned** baseline pass and the shadow pass; every changed cell is inside the dependents closure of the varied cell(s). Run under concurrent base-engine updates (a ticking feed), a no-variant shadow over the pinned pair reports **zero** deltas. |
| **G-WIF-5** | A scratch-only run leaves every durable cell's shadow value `contentKey`-equal to the pinned baseline; scratch cells evaluate, error, and test like durable cells. |
| **G-WIF-6** | Shadow test verdicts: a variant that breaks a subject's test flips that subject's verdict in the shadow suite; the base session's verdicts are untouched. |
| **G-WIF-6a** | A scratch test cell whose `subject` is a durable cell is refused at shadow-build time with a typed error; durable subjects' verdicts cannot be contaminated by scratch content. |
| **G-WIF-7** | `dispose()` on the shadow transport terminates the worker (real-Worker case) / drops the in-process worker, and a disposed transport delivers no further messages. |
| **G-WIF-8** | A worksheet named `scratch` in the document disables the scratch pad with a visible message (no silent merge, no crash). |
| **G-WIF-9** | A shadow run over the **Caldera case-study document** (variant on a model cell) completes in the harness: the varied cell and its dependents change; cells outside the closure match the Python-oracle values unchanged. *(Node harness only — no browser-latency claim; the browser measurement is a status-doc item.)* |
| **G-WIF-10** | A scratch cell referencing an undeclared external (typo'd fixture, undeclared feed) produces a visible cross-reference diagnostic in the shadow result — never a silent null-derived value. |
| **G-WIF-11** | Scratch/variant buffer text survives closing and reopening its panel; Clear on a non-empty buffer requires a confirm step. |

---

## 9. Load-bearing assumptions & code anchors  *(required)*

### Depends-on-today (verified against code)

| Assumption | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| The build message carries raw worksheet sources; rebuild is routine | `src/engine/worker/protocol.ts` | `type: 'build'; sources: Record<string, string>` |
| The engine re-sends builds after watchdog restarts (build is re-entrant) | `src/engine/asyncEngine.ts` | `#sendBuild(this.#sources)` |
| A pass clears results and re-evaluates every cell (full recompute) | `src/engine/asyncEngine.ts` | `this.#results = new Map()` |
| Published results carry a canonical content key usable for diffing | `src/engine/hash.ts` | `canonical serialization` |
| The worksheet transform rewrites the stdlib import and `export const` (unanchored today — §3.3's prerequisite fix) | `src/engine/compartment.ts` | `EXPORT_CONST` |
| The descriptor's formula text is the function's own source | `src/engine/worker/engineWorker.ts` | `formula.toString()` |
| Dependency edges (wildcards pre-expanded) are serialized on the descriptor | `src/engine/graph.ts` | `for (const dep of cells) if (dep !== ctx.id) ctx.deps.add(dep)` |
| The suite runs worker-side over host-resolved contexts | `src/engine/asyncEngine.ts` | `runTests` |
| An absent external resolves to a silent null (why §3.2 must re-validate) | `src/engine/resolve.ts` | `ext?.value ?? null` |
| External cross-reference validation runs at load, not at build | `src/app/reportSession.ts` | `xrefDiagnostics` |
| Params writes flow through `engine.update` (the live counterfactual precedent) | `src/app/reportSession.ts` | `session.engine.update` |
| The platform falls back to the in-process transport (main-thread posture, §5) | `src/app/reportSession.ts` | `inMemoryTransport` |
| The in-process worker cannot interrupt synchronous divergence | `src/engine/workerTransport.ts` | `cannot interrupt a synchronous divergence` |
| `lockdown()` runs only in the real-worker entry | `src/entry/engine.ts` | `scope.lockdown` |
| The compartment endows stdlib + nothing (starvation) | `src/engine/compartment.ts` | `new Compartment({ ...stdlib, __register: register })` |
| Feed buffers are engine-internal externals (why the snapshot must come from the engine) | `src/engine/resolve.ts` | `FEED_BUFFER_PREFIX` |

### Must-establish (new invariants the implementation creates)

| New invariant | Proven by (gate test) |
|---|---|
| `AsyncEngine.settledSnapshot()` — quiescent, coherent, deep-copied `(pass, externals)` | G-WIF-3 |
| The session retains sources + loaded document + runtime feeds for patching and re-validation | G-WIF-2, G-WIF-10 |
| `WorkerTransport.dispose()` terminates without respawn | G-WIF-7 |
| Splice refuses zero/ambiguous occurrence with typed errors | G-WIF-1 |
| The transform is line-anchored | G-WIF-1a |
| Shadow runs never mutate base-session published state or inputs | G-WIF-2, G-WIF-6 |
| Scratch runs are additive over durable state — values and verdicts | G-WIF-5, G-WIF-6a |
| Shadow builds re-run external cross-reference validation | G-WIF-10 |
| Buffer text is session-scoped; Clear is confirmed | G-WIF-11 |

---

## 10. Decisions & rejected alternatives  *(normative — don’t relitigate)*

- **A second engine instance, not an in-place mode of the base engine.** The base
  engine's single-slot supersession and published-state maps are the report's source of
  truth; threading "counterfactual" through them risks exactly the substitute-user-bytes
  class of bug the editor spec's §6 exists to prevent. Two instances make the *host-side
  state* separation structural; realm-level isolation is transport-dependent and stated
  per-transport in §5 (WIF-R1 — the earlier "structural isolation" phrasing overclaimed).
  *Rejected:* an `evaluateCounterfactual()` mode flag on `AsyncEngine`; save/restore of
  published maps around a counterfactual pass.
- **Diff against a pinned settled baseline, never the live engine (WIF-R3).** Under a
  ticking feed, "base at shadow-completion time" produces spurious deltas; a pinned
  `(pass, externals)` pair makes the diff a pure function of one epoch. *Rejected:*
  diffing against `engine.snapshot()` at completion time (partial mid-pass maps, missed
  pending externals).
- **Unique-occurrence text splice, not source spans, for v1 — with the refusal rate
  named (WIF-R4).** The splice needs zero protocol/worker changes and fails closed
  (typed refusal on zero/ambiguous occurrence, *including substrings of longer
  formulas*). *Booked as the successor, promotion criterion stated:* a build-time `span`
  on `CellDescriptor` becomes the mechanism when refusals annoy in practice.
- **Scratch is a worksheet, not a REPL.** One buffer with full worksheet grammar reuses
  the entire engine/verdict pipeline and keeps the product's named-cell semantics; a
  bespoke expression REPL would be a second evaluation grammar to secure and document.
  *Rejected:* per-probe input boxes; an expression-only evaluator.
- **Scratch tests may not target durable subjects in v1 (WIF-R6).** Refusal is the only
  option that keeps "scratch is additive" true for verdicts as well as values without a
  diff-labeling scheme; the probe-a-durable-cell feature is Q5, to be designed with its
  labeling, not slipped in. *Rejected:* silent merge into durable suites (verdict
  contamination indistinguishable from a real regression).
- **Explicit Run, not evaluate-on-keystroke.** A shadow run is build + pass + suite with
  unmeasured browser latency, main-thread on the platform today. *Rejected:* debounced
  continuous evaluation (revisit under Q1 when real workers land and a measurement
  exists).
- **Ephemeral results; session-scoped text; no apply (WIF-R9).** Persistence routes
  exist (edit-file, contribute) and gates exist (RS-10/freeze); wiring them is separate
  work with its own review. But user-typed *text* is not a security artifact: it
  survives panel close, is copyable, and Clear confirms. *Rejected:* an apply button
  gated on writability in v1; discard-on-close of typed source.
- **The panel lives in the inspector / workbook panel, not the report.** Value 2:
  run-mode chrome stays clean; the two doors that already mean "I'm looking behind the
  report" are the right doors. *Rejected:* on-pixel "try a variant" affordances in the
  report view (V3's inspection affordance may *open* the inspector, which then offers
  what-if).

---

## 11. Adversarial review  *(record)*

**Pass 1 (2026-08-27, fresh-agent), WIF-R1…WIF-R11 — all folded into this revision:**

- **WIF-R1 [BLOCKER]** "structural isolation" false on the in-process path (shared
  unhardened realm, shared input references) → §5 rewritten per-transport; §2.1
  deep-copied baseline; G-WIF-2 extended with the input-mutation case; §10 decision
  reworded.
- **WIF-R2 [BLOCKER]** watchdog cannot interrupt synchronous divergence in-process →
  §5 states the true failure mode as a named residual; the "budget trips" claim struck.
- **WIF-R3 [BLOCKER]** no pinned diff baseline under live feeds; mid-pass/pending-slot
  snapshot hazards → §2.1 `settledSnapshot()`; G-WIF-3/G-WIF-4 rewritten (ticking-feed
  gate).
- **WIF-R4 [MAJOR]** transform "prefixes" overclaim + substring-ambiguity omitted →
  §3.3 line-anchoring prerequisite (G-WIF-1a); §3.1 substring case + honest availability
  statement; anchor row corrected.
- **WIF-R5 [MAJOR]** scratch externals bypass xref validation (silent nulls) → §3.2
  shadow re-validation; G-WIF-10.
- **WIF-R6 [MAJOR]** scratch tests can flip durable subjects' verdicts → §1.2/§4
  refusal rule; G-WIF-6a; Q5 books the feature properly.
- **WIF-R7 [MAJOR]** false "Caldera live demo / per drag / proves interactive" claims;
  understated cost → §0/§2.3 corrected (build+pass+suite, unmeasured, Node-harness gate
  G-WIF-9 only).
- **WIF-R8 [MAJOR]** mobile absent (the RB-4 repeat) → §1.5.
- **WIF-R9 [MAJOR]** discard-on-close data-loss trap → §1.4 (session-scoped text,
  confirmed Clear, copy affordance); G-WIF-11.
- **WIF-R10 [MINOR]** wiki-style `[[#sec-N]]` anchors unused in this repo → converted
  to plain §N.
- **WIF-R11 [MINOR]** the externals-snapshot bullet filed under "holds today" → §2.2
  reworded to the property that holds; snapshot lives only in must-establish.

---

## 12. Open questions

- **Q1** — When the platform learns `import.meta.url` (real workers in-platform), should
  the shadow default to continuous evaluation? Requires the browser measurement §2.3
  books.
- **Q2** — The `scratch` name collision: rename affordance, or make `scratch` a reserved
  worksheet name the loader refuses in documents?
- **Q3** — Multi-variant sweeps (N shadow passes): surface design; whether results
  memoize across variants sharing a topo-order prefix.
- **Q4** — In a shared/composite deployment, does the what-if panel need a
  deployment-shape switch, or is inspector-presence the right proxy (§5)?
- **Q5** — Ad-hoc scratch tests on durable subjects: design the verdict-diff labeling
  ("new scratch test" vs "flipped by variant") that would make this safe to allow.
- **Q6** — The structured (no-code) mobile variant flow (§1.5's booked value-8 debt).
- **Q7** — `lockdown()` on the main realm for the in-process path: measure what it
  breaks (React, vendored libs) before deciding.
