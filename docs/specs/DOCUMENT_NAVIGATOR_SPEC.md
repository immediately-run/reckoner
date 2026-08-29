# Reckoner Document Navigator — the authoring vocabulary, and the edit door it will need

**Status:** **split** after one adversarial pass (§10, DN-R1…R18) — **Part A (the
vocabulary, §1–§2) is normative and shipped**; **Part B (the edit affordance, §3–§5) is
a *blocked* design: it does not ship until §5's four host-contract preconditions are
established.** · **Updated:** 2026-08-29

> **The single implementation-status source for this spec is
> `docs/status/DOCUMENT_NAVIGATOR_STATUS.md`** — where this document and that one
> disagree, the status doc governs.

> **Reads first:** the platform's `EDITOR_FIRST_EDITING_SPEC` §1 (delegate, don't
> reimplement), §6 **R-EFE-1** (the interim caller gate — a **positive `rw` check**; the
> host's non-editable detection is stubbed) and §7 rule 3; `UI_AS_APPS_SPEC` **§5.8**
> (`invokes`/`provides` declaration — *the* home of the least-authority rule) together
> with its `task:invoke` requirement; `REPO_CONTENT_DISPATCH_SPEC` §5 (the dispatch
> write-paths table and its §5.1 disclosure precedent); `AUTHORS_VIEW_SPEC` §2/§6 (the
> sibling surface, its additive-forever bar, and the author's-view-only rule this spec
> deliberately does **not** extend); `ARCHITECTURE_PLAN` §3.3 (the closed catalog).

---

## 0. Charter — and what the review changed  *(normative)*

Two gaps survive the what-if and author's-view work, both from the owner discussion:

1. **The authoring vocabulary is invisible.** "What widgets can I use as input knobs?"
   has no answer inside the product, so extending a report by hand is archaeology
   through someone else's template.
2. **Correcting something by hand has no in-app door.** A failing test names its
   `file:line` (R3-427) and the next step is still leaving the app. The platform has the
   answer — `edit-file` delegates one file to the platform editor — and Reckoner never
   opens it.

The draft treated these as one feature. **The adversarial pass separated them, and the
separation is the spec's main content** (§10):

- **The vocabulary needs no host contract at all**, and the draft put it in the wrong
  place — a permanent *catalog component*, whose content would be a function of the
  reading app rather than the document, versioned by the document's catalog compat
  range, and enumerating itself (DN-R14). It is **panel chrome**: computed, always
  present, no author action required, no additive-forever cost. That is Part A, and it
  ships.
- **The edit affordance rests on four questions about what the host actually provides**
  — whether a dispatched content mount carries a delegatable `mountId`, in which
  notation; what it reports for `mode`/`rules`; which channel carries `read-only`; and
  whether Reckoner's binding holds `task:invoke` at all (DN-R1/R2/R4/R6). Every one is
  unanswerable from this repo. Building on four guesses is how a feature ships and never
  works once. That is Part B, and it **waits** (§5).

**Not here at all** (§6): hand-editing fixture rows (the `edit-table` platform contract),
click-to-insert template mutation, open-*at-line*.

---

# Part A — the authoring vocabulary  *(normative — shipped 2026-08-28)*

## 1. The vocabulary section  *(normative)*

The workbook panel gains a **Vocabulary** section: every catalog component with its
typed attributes (name · type · required · enum values, per-variant attributes included),
a widget/container marker, and a **copyable usage snippet**.

- **Panel chrome, not a template component (DN-R14).** It is computed and unsuppressible
  like the panel's other sections, needs no author to have placed a tag, adds nothing
  permanent to the closed catalog, carries no document-compat implication, and cannot
  enumerate itself. The author's view and its `REFLECTION` set are untouched by this
  spec.
- **Derived from `catalog.ts`, never hand-listed** — a catalog addition appears here for
  free, the same anti-rot property the author's-view indexes have.
- **Reachable today.** The panel works in the bundled-seed shape (`?doc=caldera`), which
  is the shape users can actually run (DN-R12) — so Part A delivers value with Part B
  blocked.
- **Filters:** `kind: 'widgets' | 'components' | undefined` — widgets only (exactly
  `WIDGETS`), non-widget components only, or everything (DN-R17). Rendered as a section
  control, not an attribute (there is no tag to give an attribute to).

### 1.1 Snippets must validate — the whole point  *(normative)*

A snippet that cannot validate teaches the reader that the catalog is broken. The
generator therefore emits, for every entry, a snippet that **parses and validates with
zero error diagnostics** (G-DN-A3), which requires more than "required attributes":

| Catalog shape | Rule |
|---|---|
| Variants (`Chart`, `Map`) | emit the **discriminator** (`kind`) at its first value **plus that variant's** required attributes — they are not in `attributes` and only become required once `kind` is present |
| `childRule: 'single-chart'` (`Facets`) | emit with a **minimal valid `Chart` child** — a self-closing tag can never validate |
| `childRule: 'widgets'` (`Params`) | emit with a minimal valid widget child |
| `ShowAbove` / `ShowBelow` | emit **one threshold** (`width`) — the structural rule lives outside the attribute schema, so an attribute-only recipe emits an invalid tag |
| `literal-array` (`Table.columns`, `Select.options`) | emit a literal array placeholder (`{["year", "value"]}`), never a string |
| `source` | `"worksheet.cell"` · `field` | a plain name · `enum` | its first value · optional | omitted |

An entry that cannot be made to satisfy this is **listed without a snippet**, naming why
— never shipped with one that always errors (DN-R8).

## 2. Naming  *(normative)*

The report header's `Review` / `Close review` pair becomes **`Workbook`** / **`Close
workbook`** (both strings, DN-R13). It is the door to the formula, test, data and
vocabulary surfaces; "Review" described only the panel's first feature, and the very
first discoverability complaint of this thread was that nothing said the panel existed.
The button is consumer-visible and unchanged in *behaviour*: a viewer who never presses
it sees exactly what they saw before.

---

# Part B — the edit affordance  *(design; BLOCKED on §5)*

## 3. The surface, when it is unblocked  *(proposal — not built)*

Where the app already names a file, an **edit action beside the `file:line` anchor**:
the value inspector's formula row and its test rows. **Absent — not disabled — when the
document is not editable**; editor-first §7 rule 3 forbids a control that comes back
read-only, and a greyed control still claims the action exists here.

Two scope corrections the review forced:

- **The author's-view index rows are out of Part B's v1 (DN-R10).** They carry no
  `file:line` anchor today, and giving them one means widening the `ReflectionPort` with
  a worksheet→path field — a change `AUTHORS_VIEW_SPEC` §3 governs as a field-by-field
  allowlist. Booked (§11 Q5), not smuggled.
- **The consumer inspector carrying an authoring door is an open product decision
  (DN-R13).** The inspector renders for any report viewer. The formula *text* is already
  there, so this is not a new disclosure — but an edit door is a materially different act
  from a read view, and `AUTHORS_VIEW_SPEC` §6's precedent (AV-R1) is that "where an
  authoring surface may render" is a product decision to be **made**, not inferred from
  which surfaces happen to hold the data. Q6.

## 4. The delegation, as designed  *(proposal — not built)*

```ts
const { invokeTask, capFile } = await import('@immediately-run/sdk/tasks'); // §4.1
const result = await invokeTask<EditFileResult>('edit-file', {
  file: capFile({ mountId, relPath }, { mode: 'rw' }),
});
```

### 4.1 The import must be lazy  *(normative for the implementation, DN-R5)*

`@immediately-run/sdk/tasks` **registers a host listener at module load** and throws with
no host transport. A static value import white-screens the app under `vite dev` — the
repo already documents exactly this hazard in `useMounts.ts` and dodges it by importing
the side-effect-clean `mounts` subpath. The delegation therefore uses a **dynamic
`import()` inside the click handler**, wrapped so a host-less environment is a no-op —
the same shape `reportSession.ts` uses for the worker URL. (`import type` is erased and
stays fine.)

### 4.2 Both channels carry refusals  *(DN-R1)*

`invokeTask` **throws** with a machine `.code` (`cancelled`, `timeout`, `forbidden`,
`no-such-task`, `task-cycle`, `task-depth-exceeded`, `task-version-mismatch`,
`invalid-params`) **and returns `res.data` unexamined on success** — so a status the host
carries *in the result* is silently discarded by a call that ignores its return value.
The draft mapped `read-only` as a rejection code; it is not one. The implementation must
bind the result and inspect it, and the exact result contract is §5's precondition P3.

- `cancelled` → silent (the user dismissed the editor; not an error).
- `forbidden` / a result-carried refusal → one plain message, and **stop offering the
  affordance for that mount state** so a stale grant cannot produce repeated dead clicks.
- Anything else → a brief message naming the code. Never `EROFS` prose, never a stack.

### 4.3 `relPath` is untrusted author content  *(DN-R7)*

`manifest.worksheets` is validated only for non-empty-string-ness, and the loader
composes paths without resolving `..`. Under repo dispatch the **author is not the
viewer**, so a hostile workbook could present `worksheets/../../../etc/passwd.sheet.js`
as a path to delegate. Whatever the host does with that, *this app* must not construct
the delegation: reject `..` segments, absolute paths, and anything not under a known
document subdirectory, **before** `capFile`. The draft's blanket "nothing here widens
authority" is true of the capability model and was not true of what this app would have
handed it.

### 4.4 What happens after the edit  *(DN-R11)*

**A defect this feature would introduce, not one it inherits.** The session reads the
document once and the dispatch resolution latches on the first content mount; there is
no filesystem watch. So: edit, save, return — and the report shows the **old numbers
with no indication they are stale**, in a product whose whole proposition is that
displayed figures are current. Part B therefore does not ship without either a
document-changed affordance or an explicit, gated statement that the render is stale.
"Whatever reload story the dispatch flow has" asserted a mechanism that does not exist.

Additionally, per `REPO_CONTENT_DISPATCH_SPEC` §5.1 and Grove's precedent, the
affordance must **disclose at the button** that edits save to the mounted content and
proposing them back to the source repository is not wired.

## 5. Why Part B is blocked — the preconditions  *(normative)*

Each is a question about the host that this repo cannot answer, and each would, if
guessed wrong, produce a feature that ships and never works:

| # | Precondition | Why guessing fails |
|---|---|---|
| **P1** | What a `type: 'content'` dispatch mount carries as **`id`**, and whether `capFile`'s `mountId` accepts it **unqualified** | The SDK's own examples show `id` as a bare spaceId but `capFile`/`mount` taking a universal `scheme:locator` (`space:abc`). A wrong notation refuses `forbidden` on every call — which §4.2 would then misdiagnose as a permissions state and permanently suppress (DN-R4). |
| **P2** | What that mount reports for **`mode`** and **`rules`** — and, if `rules`, whether its "backend-natural" `subtree` paths are comparable to document-relative paths | A dispatched content mount is a repo mount, and `mode`/`rules` are documented absent on the primary repo mount. The draft's "absent ⇒ writable" **inverted R-EFE-1's positive `rw` check** and was the only branch that would ever run; meanwhile this repo's own dispatch fixtures stamp `mode: 'ro'`. One of those makes the affordance always-on, the other always-off (DN-R2). And `subtree` is slash-rooted while document paths are not, so the draft's fail-closed prefix match would have disabled editing everywhere the host *did* report rules (DN-R3). |
| **P3** | Which channel carries a **`read-only`** refusal for the `edit-file` task — rejection or result — and its exact shape | §4.2 exists to handle it; a call that ignores its return value handles nothing (DN-R1). |
| **P4** | Whether Reckoner's registry binding holds **`task:invoke`** | The manifest `invokes` declaration is *"a request and a self-restriction, never a grant"*; capabilities come from the host registry, which this repo cannot declare into. Without it every invocation refuses `forbidden` — the feature ships dark, permanently (DN-R6). |

**And one product precondition, P5:** whether the dispatched shape is reachable by a
user at all today. `REPO_CONTENT_DISPATCH_SPEC` is a proposal, no status doc exists for
it, and no workbook repo is named — so on the shape users can run (`?doc=caldera`),
Part B renders nothing anywhere (DN-R12). If nobody can reach the dispatched shape, the
honest sequencing is to build that path first, not to ship an invisible affordance
against it.

**The rule:** Part B is implemented when P1–P4 are established **against a real host**
(a browser-driven observation of a dispatched mount, per this repo's own debugging
guidance — not another unit test with an injected port), and P5 is answered. Until then
this document is the design and R3-447 is the item that establishes the contract.

---

## 6. Out of scope — the honest remainder  *(normative)*

- **Editing fixture rows / tabular data by hand.** The answer is a platform
  **`edit-table`** task contract (a sibling of `edit-file`: any app holding a grant on a
  CSV/JSON-rows file delegates it, the host opens a table surface) — not a grid inside
  Reckoner, which would need an editor-first §2 justification it does not have, and
  which every other tabular app would then need too. **Written 2026-08-29:
  `docs/content/specs/EDIT_TABLE_TASK_SPEC.mdx` (proposal rev 2, post-review).** It is
  blocked on the same P1–P5 this spec's §5 lists, plus two of its own (delegation mounts
  announce no `mode`; Reckoner has no fs watch) — so R3-447's host spike unblocks both.
  Its review also found the seed-vs-mount wall applies to fixtures exactly as it does
  here: on the bundled-seed path there is no file to delegate.
- **Open-at-line.** The spans exist (R3-427); `edit-file` carries no position hint.
  A small SDK/editor delta, booked against `EDITOR_FIRST_EDITING_SPEC` §6.
- **Opening a mounted file in the *main* editor** rather than the overlay — Delta B.
- **Click-to-insert / template mutation.** Placement, serialization and
  round-trip-through-the-parser are a design of their own; the vocabulary section plus a
  template edit door covers the flow at a fraction of the surface. Note Part B's v1 has
  **no template-file row** — the "copy the snippet, open the template" flow needs one,
  booked with Part B (Q7).
- **An edit affordance on the app's own source in the fused shape.** `requestEdit()`
  landed and would work, but "edit the app you are running" is a different act from
  "edit this document's file"; conflating them in one control is how someone edits the
  wrong thing.

---

## 7. Gates  *(normative for Part A; Part B's are stated but unexercised)*

### Part A — shipped

| Gate | Test |
|---|---|
| **G-DN-A1** | The vocabulary section enumerates **every** entry in `catalog.ts` — asserted against the catalog itself, never a literal list, so a future catalog addition appears without touching the section. |
| **G-DN-A2** | Attributes render with name, type, required marker and enum values, **including per-variant attributes** (a `Chart` shows `kind` and the `bar` variant's `x`/`y`), and widgets are marked as widgets. |
| **G-DN-A3** | **Every generated snippet parses and validates with zero `error` diagnostics** — the falsifiable form of "usable", run over the whole catalog so no entry can regress silently (variants, `Facets`, `Params`, `Show*`, `Table.columns`, `Select.options` all included). |
| **G-DN-A4** | The `widgets` filter yields exactly `WIDGETS`; `components` yields exactly the complement; unset yields all — the third case the draft left undefined. |
| **G-DN-A5** | The panel renders the section with no document loaded beyond the seed, and with **no host transport** — the vocabulary must not import anything that throws at module load (the §4.1 hazard, asserted for Part A too). |
| **G-DN-A6** | The header button reads `Workbook` / `Close workbook`. |

### Part B — stated, unexercised until §5 clears

G-DN-B1 mount id/mode/rules provenance · B2 editability derivation against the
*established* semantics · B3 path-notation normalization with segment boundaries · B4
delegation shape **and value provenance** · B5 both refusal channels incl. the
result-carried case, `no-such-task` and `timeout` · B6 affordance absent unless writable
· B7 traversal-shaped `manifest.worksheets` never reaches `capFile` · B8 host-less boot
after the lazy import · B9 the stale-render affordance · B10 `invokes` declared **and**
`task:invoke` established. **No Part B gate may be host-free** for P1–P4: those are
questions about the host, and an injected port cannot falsify them (DN-R17).

---

## 8. Load-bearing assumptions & code anchors  *(required)*

### Depends-on-today (verified against this repo's code)

| Assumption | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| The catalog is a closed typed schema list with variants and child rules | `src/report/catalog.ts` | `const COMPONENTS: ComponentSchema[]` |
| The widget set is enumerated | `src/report/catalog.ts` | `export const WIDGETS` |
| Validation enforces variant discriminators, child rules and `literal-array` shapes — what §1.1's snippets must satisfy | `src/report/validate.ts` | `childRule` |
| Templates parse to the node model the gate validates through | `src/report/parse/mdx.ts` | `export function parseTemplate` |
| The workbook panel is the always-present computed surface the section joins | `src/app/WorkbookPanel.tsx` | `WorkbookPanelBody` |
| Document files carry a **document-relative** path (`worksheets/x.sheet.js`) — Part B's `relPath` | `src/document/loader.ts` | `path: rel` |
| `manifest.worksheets` is validated only for non-empty strings (why §4.3 exists) | `src/document/manifest.ts` | `"worksheets" must be an array` |
| The dispatch keeps only the mount's path today (Part B's P1/P2 change it) | `src/app/dispatch.ts` | `marked[0].path` |
| The SDK's task module registers a listener at import (why §4.1 is lazy) | `src/hooks/useMounts.ts` | `registers a host listener at module load` |

*(SDK contracts are cited by their published documentation — `llms.txt` / `api.json` at
the version this repo depends on — not by `node_modules` paths: those are gitignored,
float with the dependency range, and are absent on a fresh clone. The draft anchored
three rows there and one at a sibling repo; both are outside this table's contract.)*

### Must-establish (new invariants the implementation creates)

| New invariant | Proven by |
|---|---|
| The vocabulary section is derived, complete, and filterable | G-DN-A1, G-DN-A2, G-DN-A4 |
| Every snippet validates | G-DN-A3 |
| Nothing in the section throws without a host | G-DN-A5 |
| Part B's P1–P4 host contract | **Not established — §5; R3-447** |

---

## 9. Decisions & rejected alternatives  *(normative — don't relitigate)*

- **The vocabulary is panel chrome, not a catalog component (DN-R14).** A catalog
  addition is permanent, is versioned by the *document's* compat range, would render
  content that is a function of the *reading app* rather than the document (the catalog
  is a fork point), and would enumerate itself. Panel chrome has none of those
  properties and is *more* discoverable, since no author must place a tag. *Rejected:*
  the draft's `<CatalogIndex />` component — and with it the draft's claim that its
  author's-view-only gating was "structural", which it was not: unlike its siblings it
  does not take its data from the reflection port, so withholding the port took nothing
  away (DN-R9).
- **Ship the vocabulary; block the edit door (DN-R2/R4/R6/R12).** Four host-contract
  questions and one reachability question, none answerable from this repo, each fatal if
  guessed. *Rejected:* shipping Part B on plausible defaults — the draft's "absent
  `mode` ⇒ writable" inverted the very guidance it cited, and was the only branch that
  would have run.
- **Snippets are gated on validating, not hedged as "a starting point" (DN-R8).** Seven
  of nineteen entries could not produce a valid snippet under the draft's recipe. A copy
  button that always yields red diagnostics is worse than no button. *Rejected:* the
  "not a promise of validity" hedge as cover for known-invalid output.
- **Data section read-only; the file link is the edit path** *(owner lean, recorded as
  default)*. Row editing wants `edit-table` at the platform (§6). *Rejected for v1:* an
  in-app fixture grid.
- **Catalog + copyable snippet, not click-to-insert** *(owner lean, recorded as
  default)*. *Rejected for v1:* insert-on-click.
- **The vocabulary lives in the workbook panel, not the inspector** *(the third open
  question, decided as the reversible default)*. It is reference material read while
  authoring, not per-value context. *Rejected for v1:* a contextual "this value could be
  a slider" hint — a good idea needing a rule for when it helps rather than intrudes
  (Q4).
- **Absent affordance, not disabled affordance** when not writable (editor-first §7
  rule 3). *Rejected:* greyed controls with tooltips.
- **`Review` → `Workbook`, both label strings.** *Rejected:* a name describing only the
  panel's first feature.

---

## 10. Adversarial review  *(record)*

**Pass 1 (2026-08-28, fresh-agent), DN-R1…DN-R18 — folded; four BLOCKERs are why this
document is split rather than revised:**

- **DN-R1 [BLOCKER]** `read-only` mapped as an `invokeTask` rejection code; it is not
  one, and the draft's call discarded its result → §4.2 rewritten for both channels;
  the exact contract becomes precondition **P3**.
- **DN-R2 [BLOCKER]** "absent `mode` ⇒ writable" **inverted** R-EFE-1's positive `rw`
  check while citing it as authority, and was the only branch that fires on a repo-backed
  content mount (this repo's own fixtures say `ro`) → precondition **P2**.
- **DN-R3 [BLOCKER]** `MountRule.subtree` is slash-rooted and "backend-natural";
  document paths are not, so the fail-closed prefix match disabled editing wherever rules
  were reported — and the draft's gate encoded the mismatch → folded into **P2**.
- **DN-R4 [BLOCKER]** `SandboxMount.id` (bare spaceId) is not `capFile`'s universal
  `scheme:locator` `mountId` → precondition **P1**.
- **DN-R5 [MAJOR]** a static SDK `tasks` import throws at module load (the hazard this
  repo already documents in `useMounts.ts`) → §4.1 lazy import; G-DN-A5 asserts it for
  Part A too.
- **DN-R6 [MAJOR]** `invokes` is half the §5.8 rule; `task:invoke` is host-side and
  unestablished, and the draft's manifest gate tested only the half a unit test can see
  → precondition **P4**.
- **DN-R7 [MAJOR]** `relPath` built from unvalidated author-controlled manifest content
  → §4.3 validation before `capFile`; the "widens no authority" claim qualified.
- **DN-R8 [MAJOR]** the snippet recipe could not emit a valid snippet for 7/19 entries
  → §1.1's per-shape rules; G-DN-A3 gates on zero error diagnostics.
- **DN-R9 [MAJOR]** the component's author's-view gating was advisory, not structural →
  dissolved with DN-R14 (no component).
- **DN-R10 [MAJOR]** author's-view rows referenced a `file:line` anchor that exists only
  in the inspector, and would need an unbooked `ReflectionPort` widening → dropped from
  Part B v1; booked Q5.
- **DN-R11 [MAJOR]** "nothing happens after the edit" concealed a stale-render defect
  the feature introduces, and omitted RCD §5.1's disclosure-at-the-button → §4.4.
- **DN-R12 [MAJOR]** Part B renders nothing in the only shape users can reach → **P5**,
  and Part A is sequenced first precisely because it does not.
- **DN-R13 [MAJOR]** an authoring door on the consumer-visible inspector was never
  decided → Q6; §2 now specifies both label strings.
- **DN-R14 [MAJOR]** a permanent catalog entry describing the app rather than the
  document → panel chrome (§1, §9).
- **DN-R15 [MINOR]** anchors into gitignored `node_modules`, a sibling repo, and a token
  that matched without supporting its claim → §8 rebuilt.
- **DN-R16 [MINOR]** §5.8 attributed to the wrong spec → cited to `UI_AS_APPS_SPEC`.
- **DN-R17 [MINOR]** gate holes (result channel, `no-such-task`, host-less boot, no
  host-exercised gate) and an undefined `components` filter → §7.
- **DN-R18 [MINOR]** spec-form drift (no review-record slot, mis-tagged sections,
  "verified against code" over unverified rows) → structure and tags corrected.

---

## 11. Open questions

- **Q1** — `edit-table`: who owns the platform spec, and does it subsume the fixture
  case or want a Reckoner-side shape first? *(Answered 2026-08-29 on the first half —
  the spec is written and lives in the docs repo, `EDIT_TABLE_TASK_SPEC.mdx`. It
  subsumes the fixture case and needs **no** Reckoner-side shape first; what it needs
  from Reckoner is the D7 fs watch and a `task:invoke` binding, both booked there.)*
- **Q2** — The `edit-file` position hint (open-at-line): SDK param vs. task-contract
  version bump.
- **Q3** — After an edit lands: an explicit reload affordance, or a change-watch on the
  mount? (§4.4 requires one of them before Part B ships.)
- **Q4** — Contextual vocabulary hints in the inspector — worth it, or noise?
- **Q5** — Widening `ReflectionPort` with worksheet→path so the author's-view indexes
  can carry anchors and (later) edit doors — worth the allowlist addition?
- **Q6** — Does the consumer-visible inspector carry the edit affordance at all?
- **Q7** — A template-file edit row, without which "copy the snippet, open the template"
  has no door.
