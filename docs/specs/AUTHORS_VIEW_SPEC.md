# Reckoner Author's View — the document describing itself, as a template the author owns

**Status:** implemented at the deliverable level — R3-433/R3-434; one adversarial pass
folded (§11, AV-R1…R14); residuals live in the status doc. · **Updated:** 2026-08-28

*(Implementation note, 2026-08-28 — authored, adversarially reviewed, and built in the
same pass: §§1–6 and the §8 gates are normative and shipped; §7 and §12 remain the
honest remainder. The `proposal` markers on built sections were reconciled in this
edit, per spec_style "keep status honest".)*

> **The single implementation-status source for this spec is
> `docs/status/AUTHORS_VIEW_STATUS.md`** — where this document and that one disagree, the
> status doc governs.

> **Reads first:** `ARCHITECTURE_PLAN.md` §3.3 (the closed component catalog, RQ-F1,
> anti-affordances), §8 (the assistant + `FORMULA_AUTHORING_PROMPT`), R-5 (the
> additive-only discipline — stated there for the stdlib; the catalog shares it through
> the versioning/compat story, `DOCUMENT_VERSIONING_SPEC`); `product_definition.md`'s
> viewer promise ("open a link, see a live report … and never see a formula" — load-bearing
> for §6); `WHATIF_SHADOW_EVALUATION_SPEC.md` (sibling review surface; shared
> run-mode-first posture); `REPORTING_SPREADSHEET_SPEC.md` §3.4 and the platform's
> `TRUST_MODES_SPEC` §5.1 (non-executable templates).

---

## 0. Charter  *(normative — shipped 2026-08-28)*

A Reckoner document's consumer report deliberately shows *results, not workings*. The
workings — what formulas exist, what tests cover them, what data feeds them, and why the
model is shaped the way it is — are discoverable today only through interactive chrome
(the workbook panel, the inspector) or by reading source files. There is no *document*
that presents the document: nothing shareable, diffable, or reviewable that says "here is
this workbook, explained."

The **author's view** is that document: a second rendered view summarizing formulas, data
tables, and test assets — plus, optionally, the creators' thinking. Its two halves have
different owners:

- **The inventory is application responsibility.** What exists and how well it is tested
  is *computed*, rendered by new catalog **reflection components** (§2) that enumerate
  live state — never hand-listed, so it cannot rot or lie about coverage.
- **The narrative is the author's.** The view is an ordinary template file the author
  owns completely — reorderable, annotatable, and **deletable in part or whole**. There
  is deliberately **no enforcement** that any generated section remains (§6; owner
  decision, §10): the trust surface for completeness is the computed chrome (workbook
  panel, inspector), which stays unsuppressible regardless of what any template says. A
  document is curated; the chrome is complete.

No new realm, capability, principal, service, or gate. One new template role, four new
catalog components, one new render port, one new (optional) manifest key.

---

## 1. Product surface  *(normative — shipped 2026-08-28)*

### 1.1 Default when absent; file when owned

- With **no** author's-view template in the document, the app renders a **built-in
  default view** (the scaffold, §5.1) — live, never materialized, complete by
  construction because its components enumerate everything (§2.1).
- When the document carries `templates/authors_view.mdx` (or the template the manifest's
  optional `authorsView` key names, §4), that file **is** the author's view — replacing
  the default entirely. Creating the file is how an author takes ownership; a
  "customize" affordance that materializes the scaffold into the document is booked
  (§7), pending the write path.

### 1.2 The door, and the way back

The author's view opens from the **workbook panel** (the existing author-side door;
run-mode report chrome is untouched — value 2, same posture as the what-if surfaces).
Mechanics, stated plainly (AV-R13):

- Opening the view closes the workbook panel and renders the view **in place of the
  report**, under a small view header carrying the title and an explicit **Back to
  report** action.
- The view is app component state, not a route: **browser/hardware back exits the app**,
  exactly as it does for the workbook panel today. In-app deep-linking to the view is
  deferred to whatever routing story the app grows (§7) — not promised here.
- A pure viewer who never opens the review door never sees any of it.

### 1.3 Mobile (value 8)

The view is prose + stacked cards + tables. v1 requirements (AV-R13): tables scroll in
their own containers (the existing report-CSS discipline); **formula source blocks get
their own horizontal-overflow containers** (they are multi-line code, not prose); the
formula index groups **per worksheet in native collapsible sections** so an
enumerate-everything render of a large workbook is navigable rather than one unbounded
page; the door and Back are plain buttons, touch-complete. Nothing here is desktop-only.

---

## 2. The reflection components  *(normative — shipped 2026-08-28)*

Four additions to the closed catalog. **The additive-only discipline applies with full
force** (R-5's stdlib rule, shared by the catalog via versioning/compat): additions are
forever, so the vocabulary is deliberately minimal, with enumerate-everything defaults
and narrowly-typed filters; each addition passes the same anti-affordance scrutiny as
any catalog change.

| Component | Attributes | Renders |
|---|---|---|
| `<FormulaIndex />` | `worksheet?: string` | Every cell (or the named worksheet's), grouped per worksheet in collapsible sections: name, `doc`, read-only formula source (own overflow container), computed verdict chip. |
| `<TestIndex />` | `worksheet?: string`, `subject?: string` | Every test (or the filtered set): kind label, subject, latest outcome (pass/fail + message). |
| `<DataInventory />` | `kind?: 'fixtures' \| 'feeds'` | Fixtures: name, shape (§3.1's derivation), **declared** tier (§3.2), provenance note. Feeds: the §3.3 allowlist projection — never raw config. |
| `<SuiteSummary />` | — | The panel's one-line suite report — same `summarizeSuite`, same results object (§3.4). |

### 2.1 Enumerate-everything defaults

Filterless usage lists the whole document, live — so an **unedited** scaffold stays
complete forever without regeneration. An author who explodes the view into hand-picked
filtered sections has chosen curation; the chrome remains the complete fallback.

### 2.2 Degradation, not silence

- A filter naming a missing object (`worksheet="modle"`) renders the standard **broken
  tile** with the reason — the no-silent-nulls discipline, at render time where the
  authoring loop sees it.
- A reflection component rendered with **no reflection port** (§3) — including in a
  consumer report, where the port is deliberately withheld (§6) — renders the broken
  tile stating the component is author's-view-only. Degrade, never crash.

### 2.3 Computed vs authored stays visually unmistakable — including the pending state

Verdict chips and kind labels render in the system's existing computed visual language;
author prose renders as prose; templates cannot express chip styling (no attribute for
it — the anti-affordance pattern). Two precision rules this pass added:

- **Pending is not a verdict (AV-R2).** Suite results arrive asynchronously; before
  they exist (`verdicts: null`, §3.4) chips render a **distinct pending presentation**
  (its own class and label, none of the four verdict states) and `SuiteSummary` renders
  the panel's "Running suites…" line — never a false `untested` count. The four-state
  chip vocabulary is reserved for computed verdicts, exactly as the workbook panel
  guards it.
- **A declared tier is not computed chrome (AV-R5)** — see §3.2.

---

## 3. The reflection port  *(normative — shipped 2026-08-28)*

Reflection components read a **reflection port** provided to `ReportView` alongside the
existing `bindings`/`inspection` ports — the same optional-context pattern V3 uses:

```ts
interface ReflectionPort {
  cells(): readonly CellDescriptor[];      // id, worksheet, doc, formulaSource, deps
  tests(): readonly TestDescriptor[];
  /** The SAME suite-results object the review chrome renders (§3.4); null = pending. */
  verdicts: ReadonlyMap<string, SubjectResult> | null;
  fixtures: readonly FixtureSummary[];     // §3.1/§3.2 — derived, allowlisted
  feeds: readonly FeedSummary[];           // §3.3 — allowlisted projection
}
```

Everything the port exposes is Class A — the document describing itself, already visible
to anyone who can open the workbook panel — **but Class-A reach is not the display rule**;
what may render *where* is §6's product decision. The port is assembled app-side; it is
**derived render-state, not a snapshot store** (§3.4).

### 3.1 Fixture shape is derived, and says so (AV-R4)

`FixtureFile` carries `rows`, `tier`, `provenance` — **no column list or count exists in
the document model**. The port derives, once per session (fixtures are load-time static):
`rowCount = rows.length`; `columns` = the keys of the **first row**, rendered with the
qualifier "first-row columns" — an honest label for an O(1) derivation that can under-
describe a heterogeneous fixture, rather than an unlabeled claim that can lie. (A full
union scan is rejected for v1 — unbounded cost on large pulled frames for a summary
line.) These fields live in **must-establish**, not depends-on-today.

### 3.2 The fixture tier is authored metadata — rendered as such (AV-R5)

`FixtureFrame.tier` is *advisory display metadata the document's author wrote*; the host
mount tier is authoritative. The inventory therefore renders it as **plain labeled data
("declared tier: static")** in the inspector's plain-text style (the review-1 H2
precedent: tier as data, never as a badge) — never in chip/chrome styling. Stamping an
authored trust claim with computed chrome would be the exact imitation §2.3 bans.

### 3.3 Feeds are an allowlist projection, and URLs are stripped (AV-R6)

`FeedSummary` is built **field by field — never a spread of `FeedConfig`**:
`{ name, mode?, hosts }`, where `hosts` is derived per source entry as **scheme + host
only** — path, query, and userinfo stripped, because real feed URLs routinely embed
credentials (`?api_key=…`, signed tokens) outside `auth.secretRef`. An unparseable
source renders as "unparseable source", never raw. `secretRef` names are also excluded:
a name like `prod_stripe_key` is not a secret but is reconnaissance about the user's
secret store, and the inventory has no need for it.

### 3.4 One suite computation; the port is derived state (AV-R8)

The verdicts the port carries MUST be **the same results object** the review chrome
renders — one `useVerdicts` instance, owned at app level and passed down to the panel,
the inspector, and the port alike ("the verdicts must not be computed twice per pass or
the two surfaces could disagree" — the hook's own contract; the current
double-instantiation in App and the panel is corrected by this work, not worsened). The
port is assembled in render from current state and reassembles with it (tick / suite
completion); its freshness property is "always what the chrome shows", not "never
stale" — there is no independent snapshot to age.

### 3.5 Session shape with a second template (AV-R14)

The session carries **two node trees**: the consumer report's (as today) and the
author's view's (from the document file, else the built-in scaffold). Each is validated
against the catalog separately, with diagnostics attributed to its own file (the
scaffold cannot fail validation — G-AV-8 gates that at build time). The cross-reference
params universe includes widget names from **both** trees, so a `<Params>` widget an
author places in a custom author's view resolves rather than false-flagging. Bindings
are pull-based (`resolve(source)` at render), so no subscription set changes.

---

## 4. Template selection  *(normative — shipped 2026-08-28)*

- The reserved template name **`authors_view`** is the author's view by default; the
  manifest may name a different one via an optional **`authorsView`** key (the one
  manifest delta this spec proposes).
- The author's-view template is **excluded from consumer-report selection**. The
  consumer pick keeps today's behavior otherwise (AV-R3): the template named `weekly`
  if present, else the **first non-authors-view** template — no new report-naming key
  is proposed here (the `weekly` guess remains a wart, out of scope). A document whose
  only template is an author's view renders the report empty-state, never the author's
  view.

---

## 5. The scaffold and the Decisions convention  *(normative — shipped 2026-08-28)*

### 5.1 The scaffold

The built-in default (also what a future "customize" materializes — the two are the
same document; the heading is static because templates have no interpolation and the
app chrome already shows the document title, AV-R7):

```mdx
# Author's view.

<SuiteSummary />

## Decisions.

No decisions recorded yet — the workbook's why lives here: what was chosen, what was
rejected, what the tests guard.

## Formulas.

<FormulaIndex />

## Data.

<DataInventory />

## Tests.

<TestIndex />
```

### 5.2 Decisions — where the thinking survives

The `## Decisions.` section is the document-level home for the creators' reasoning —
the working culture's *decisions & rejected alternatives* discipline applied to workbook
documents. Content boundaries, with their enforcement stated honestly (AV-R9):

- **Decisions and assumptions, never transcripts.** What was inferred from, what shape
  was rejected and why, what the holdout withholds, what each metamorphic relation
  guards. **The chat-log exclusion is a privacy boundary** — chat may carry the user's
  private context, and this document is built to be shared and diffed — and it is
  enforced today only by prompt discipline plus the contribute gate's human full-diff
  review, **labeled as such, not presented as enforced**. A mechanical backstop is an
  open question (Q5), not a claim.
- **Why, never whether.** Coverage *claims* belong to the computed chrome; the record
  explains intent, the verdicts state fact. (Prose asserting "fully tested" beside a
  red chip misleads no one precisely because the chip is computed — §2.3.)
- **Signed and dated by convention** ("recorded by the assistant, 2026-…"). A
  legibility convention, not provenance — the platform deliberately tracks no per-file
  authorship.

### 5.3 The agent hook

`docs/assistant/FORMULA_AUTHORING_PROMPT.md` gains a **post-loop standing duty** —
"record the decision" — rather than a reordered loop step (the loop's ends are
explicitly fixed, AV-R10), and the prompt's scope note is widened by exactly one
sentence: the Decisions record is the one template surface this prompt touches, until
the report-generation pipeline's own prompt (plan §8.4) exists and takes it over. The
*fact* of recording is documentation, so prompt-level is the honest mechanism; the
*privacy boundary* within it is labeled per §5.2. The E-6 agent-loop evaluation gains
"is the decision recorded, within the boundaries" as a scored criterion when that
harness runs.

---

## 6. Where reflection may render — the product decision  *(normative — shipped 2026-08-28; rewritten per AV-R1)*

The draft's "reflection components are legal in any template" is **withdrawn**. The
product definition promises the report viewer: *"open a link, see a live report, drill
into it, and never see a formula."* That sentence is about the consumer surface, and
`<FormulaIndex />` in a consumer template would put every cell's source in front of the
viewers that promise covers. Class-A reach arguments do not decide this — reach bounds
what a realm can *touch*, not what the product *shows* — and an author's ability to
hand-paste formula text into prose (real, and unpreventable in any template system) is
parity for *deliberate* disclosure, not a reason to make wholesale disclosure one tag
away.

The rule: **reflection components render only in the author's-view template.**

- **Load time:** a reflection component in any other template is a **validation
  diagnostic** (warning — the document still loads).
- **Render time:** the reflection port is provided **only** to the author's-view
  render; everywhere else the components hit the no-port path and render the
  author's-view-only broken tile (§2.2). The restriction is therefore structural, not
  advisory.

The rest of the trust story, unchanged from the draft:

- **No enforcement of section presence — deliberate** (owner decision 2026-08-28, §10).
  Completeness is guaranteed where it is load-bearing: the panel and inspector render
  host-computed verdicts over the full inventory, unsuppressible by any template.
- **Non-executable throughout.** The view is a template: safe-rendered, declarative, no
  expression evaluation; prose is diff-visible at the contribute gate. Bounded-injection
  posture (TS-1) unchanged; no new channel.
- **The port is secret-free by construction** (§3.3): allowlist projections, stripped
  hosts, no `secretRef` names or values, gate-tested (G-AV-9).

---

## 7. Out of scope — the honest remainder  *(normative — the booked remainder, nothing here shipped)*

- **Materialize-on-customize** (the button that writes the scaffold into `templates/`):
  needs the document write path (rw mount + editor flow, the navigator thread). Until
  then, authors create the file by hand or via the editor.
- **A file-include mechanism** (`<Include file="…"/>`): needs bundle-relative
  resolution and cycle handling; deferred until composition pressure is real (owner:
  components-only for v1).
- **Per-cell deep links** from index rows into the editor ride the navigator work and
  R3-427 (spans), not this spec.
- **In-app deep-linking / routing** for the view (§1.2): follows the app's routing
  story, which does not exist yet; the view is component state in v1.
- **Rendering in shared/anonymous-viewer deployments** follows whatever the deployment
  shape decides for the workbook panel itself — the door gates the view, and §6 now
  guarantees the components cannot ride into the consumer report around that door.

---

## 8. Gates  *(normative — the falsifiable exit tests, shipped 2026-08-28)*

| Gate | Test |
|---|---|
| **G-AV-1** | With no author's-view template, the default view renders from live state: the suite line, the Decisions heading, every cell, every fixture and feed, every test — no materialized file. |
| **G-AV-2** | A document's own `authors_view.mdx` replaces the default entirely; a custom file omitting `<FormulaIndex />` renders without the formula index (no enforcement), while the workbook panel still lists every cell. |
| **G-AV-3** | The author's-view template is excluded from consumer-report selection: templates `[authors_view, weekly]` serve `weekly` as the report; a document with only an author's view renders the report empty-state, never the author's view. |
| **G-AV-4** | The manifest's `authorsView` key selects a differently-named template as the author's view (and excludes it from consumer selection). |
| **G-AV-5** | `<FormulaIndex worksheet="modle" />` (unknown filter) renders the broken tile with a reason — no crash, no silent empty list. |
| **G-AV-6** | Verdict chips render each computed verdict with its per-state class/label — the same four classes the workbook panel uses — driven by the same results object; a `verdicts: null` port renders a **pending** class/label that is none of the four, and `SuiteSummary` renders "Running suites…", never a verdict count (AV-R2/AV-R12). |
| **G-AV-7** | A reflection component rendered with no reflection port renders the author's-view-only broken tile — including when placed in a consumer template, which additionally raises a load-time validation warning (AV-R1). |
| **G-AV-8** | The scaffold parses with zero template diagnostics and validates against the catalog. |
| **G-AV-9** | `DataInventory` renders fixture name / first-row columns / row count / declared tier (plain-labeled, not chip-styled) / provenance, and feed name/mode/host — and a feed whose source URL carries a query-string credential (`?api_key=…`) renders **without** the query string, path, or userinfo; no `secretRef` content appears (AV-R5/AV-R6). |
| **G-AV-10** | One suite computation: the port's verdicts are reference-identical to the results the workbook panel renders (the hoisted single `useVerdicts`), asserted at the App wiring level (AV-R8). |

---

## 9. Load-bearing assumptions & code anchors  *(required)*

### Depends-on-today (verified against code)

| Assumption | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| The catalog is a closed, typed schema list; unknown components render a placeholder | `src/report/catalog.ts` | `const COMPONENTS: ComponentSchema[]` |
| The renderer dispatches by name over `componentMap`; missing names → `Placeholder` | `src/report/render/Renderer.tsx` | `componentMap[node.name]` |
| Optional ports flow through `ReportView` as contexts (the V3 precedent) | `src/report/render/Renderer.tsx` | `InspectionContext.Provider` |
| Templates parse to a node model and validate against the catalog | `src/report/validate.ts` | `export function validateTemplate` |
| The consumer template pick is name-guessed (`weekly`, else first) — §4 narrows its candidate set only | `src/app/reportSession.ts` | `name === 'weekly'` |
| Suite verdicts and the one-line summary are host-computed; a null result set renders a running state, not verdicts | `src/app/WorkbookPanel.tsx` | `Running suites` |
| The verdicts hook forbids double computation ("only one of them") | `src/hooks/useVerdicts.ts` | `re-runs the SAME` |
| Cell/test descriptors carry id, doc, formulaSource, deps (the index's data) | `src/engine/worker/protocol.ts` | `formulaSource` |
| Fixture files carry rows/tier/provenance — and **no** column list or count (§3.1 derives) | `src/document/types.ts` | `advisory display metadata` |
| Feed config's `source` is a raw URL string (why §3.3 strips) | `src/document/types.ts` | `source` |
| The workbook panel remains the complete, unsuppressible inventory | `src/app/WorkbookPanel.tsx` | `WorkbookPanelBody` |
| The authoring loop's ends are fixed (why §5.3 is post-loop) | `docs/assistant/FORMULA_AUTHORING_PROMPT.md` | `The authoring loop` |
| The viewer promise §6 rests on | `docs/product_definition.md` | `never see a formula` |

### Must-establish (new invariants the implementation creates)

| New invariant | Proven by (gate test) |
|---|---|
| A reflection port assembled from live session state; verdicts single-sourced | G-AV-1, G-AV-10 |
| Fixture shape derived (first-row columns + rowCount), labeled as derived | G-AV-9 |
| `FeedSummary` is an allowlist projection with stripped hosts | G-AV-9 |
| Default-when-absent / file-when-owned selection; manifest `authorsView` honored | G-AV-1, G-AV-2, G-AV-4 |
| The author's-view template never serves as the consumer report | G-AV-3 |
| Reflection components render only in the author's view (structural + diagnostic) | G-AV-7 |
| Chips: four computed states + a distinct pending state, panel-identical classes | G-AV-6 |
| The scaffold is valid against the catalog | G-AV-8 |

---

## 10. Decisions & rejected alternatives  *(normative — don't relitigate)*

- **No enforcement that generated sections survive author editing** (owner decision,
  2026-08-28). The author's view is a curated document; completeness lives in the
  computed chrome, which no template can suppress. *Rejected:* an "additive-only"
  mechanism policing the author's own file — theater against a party who owns the tests
  themselves.
- **Reflection components are author's-view-only (AV-R1).** The product's viewer
  promise ("never see a formula") outranks the Class-A reach argument; the restriction
  is structural (port withheld) plus a load-time diagnostic. *Rejected:* "legal in any
  template, no special-casing" (the withdrawn draft position); prose-paste parity as a
  justification for one-tag wholesale disclosure.
- **Reflection components as the only mechanism — no annotation-fragment subsystem.**
  One mechanism (templates + catalog) carries both inventory and narrative. *Rejected:*
  a generated spine with keyed annotation fragments — a second content system with its
  own keying, orphan-validation, and staleness surface.
- **Default-when-absent, file-when-owned.** No boilerplate file in every document; the
  file's existence means an author took ownership. *Rejected:* pre-generating the file
  into every document; regenerating over an authored file.
- **Enumerate-everything defaults; per-worksheet collapsible grouping.** An unedited
  scaffold stays complete without regeneration and stays navigable on a large workbook.
  *Rejected:* hand-enumerated scaffolds; one unbounded flat page.
- **A minimal four-component vocabulary; a static scaffold heading (AV-R7).** The
  additive-forever discipline caps the surface; no interpolation mechanism and no fifth
  title component ride in — the app chrome already names the document. *Rejected:*
  per-object micro-components; a `<DocTitle />`; template interpolation.
- **First-row column derivation, labeled (AV-R4).** O(1), honest about its bound.
  *Rejected:* an unlabeled column claim; a full union scan (unbounded on large frames).
- **Declared fixture tier renders as plain labeled data (AV-R5)** — the review-1 H2
  precedent. *Rejected:* chip-styling authored metadata.
- **Components-only; no `<Include>`** (owner lean, 2026-08-28). *Rejected for v1:*
  file inclusion (bundle addressing + cycles).
- **The view opens from the workbook panel, renders in place of the report with an
  explicit Back; no routing claims (AV-R13).** *Rejected:* a tab bar; implying
  browser-back or deep-link behavior the app cannot deliver yet.

---

## 11. Adversarial review  *(record)*

**Pass 1 (2026-08-28, fresh-agent), AV-R1…AV-R14 — all folded into this revision:**

- **AV-R1 [BLOCKER]** reflection legal in ungated consumer reports contradicted the
  door story and the product's "never see a formula" promise → §6 rewritten:
  author's-view-only, structural (port withheld) + diagnostic; decision recorded.
- **AV-R2 [BLOCKER]** `verdicts: null` specified as an "untested"-style render — the
  four-state mislabel the panel forbids — and contradicted G-AV-6 → §2.3/§3.4 distinct
  pending state; SuiteSummary "Running suites…"; G-AV-6 rewritten.
- **AV-R3 [MAJOR]** "manifest-named report template" referenced a nonexistent key →
  §4 restated: `weekly` guess retained over non-authors-view candidates; no report key
  proposed.
- **AV-R4 [MAJOR]** fixture columns/rowCount filed as depends-on-today but exist
  nowhere → §3.1 derivation specified (first-row, labeled, O(1)); moved to
  must-establish.
- **AV-R5 [MAJOR]** authored fixture tier stamped with computed chrome → §3.2 plain
  labeled data, H2 precedent.
- **AV-R6 [MAJOR]** feed source URLs can embed credentials; G-AV-9 tested only
  `secretRef` → §3.3 allowlist projection, scheme+host stripping, G-AV-9 extended.
- **AV-R7 [MAJOR]** scaffold `# <title>` unimplementable (no interpolation, no title
  binding) → static heading; default and materialized scaffold stay one document.
- **AV-R8 [MAJOR]** verdicts source unpinned against the hook's single-computation
  contract (double instantiation already live); false "never stale" claim → §3.4
  hoisted single source, G-AV-10; freshness claim corrected.
- **AV-R9 [MAJOR]** the chat-log exclusion is a privacy boundary mislabeled as
  non-safety → §5.2 split: prompt discipline labeled as such, human diff-gate named as
  the backstop, mechanism booked (Q5).
- **AV-R10 [MINOR]** prompt delta violated the prompt's own scope note and fixed loop
  ends → §5.3 post-loop standing duty + one-sentence scope widening.
- **AV-R11 [MINOR]** anchor token matched only a filename; R-5 cited as "catalog" risk
  → token replaced; citation corrected to stdlib-rule-shared-via-versioning.
- **AV-R12 [MINOR]** "visually distinct" unfalsifiable → G-AV-6 restated over classes.
- **AV-R13 [MINOR]** mobile/door mechanics under-specified for code blocks and back
  behavior → §1.2/§1.3 concretized (overflow containers, collapsible grouping, no
  routing claims).
- **AV-R14 [MINOR]** second-template session threading unspecified → §3.5.

---

## 12. Open questions

- **Q1** — The "customize" affordance (materialize the scaffold): lands with the
  document write path; who owns the file-collision rule (a stray `authors_view.mdx`
  present but manifest-overridden)?
- **Q2** — Index-row deep links into the editor (file + line): compose with the
  navigator work and R3-427 once spans exist.
- **Q3** — Should the contribute/review surface render the author's-view *diff*
  specially (narrative beside formula/test diffs), or is the plain file diff enough?
- **Q4** — When the assistant realm lands: does record-the-decision create
  `authors_view.mdx` (taking ownership on the author's behalf) or require it to exist?
- **Q5** — A mechanical backstop for the §5.2 privacy boundary (e.g., the contribute
  gate flagging transcript-shaped content in Decisions diffs) — worth its
  false-positive cost?
