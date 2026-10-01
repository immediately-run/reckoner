# DOCUMENT_NAVIGATOR — implementation status

**Status:** **Part A implemented (R3-446); Part B's contract established + build landed (R3-447), live gates green on the rw dispatch shape (2026-10-01)** ·
**Updated:** 2026-10-01

This document is the single implementation-status source for
`docs/specs/DOCUMENT_NAVIGATOR_SPEC.md`; where they disagree, this document governs.

## Part A — the authoring vocabulary (shipped 2026-08-28)

- `src/app/vocabulary.ts` — the pure derivation: every catalog entry with its typed
  attributes (base + per-variant, variant-labelled) and a usage snippet built per the
  spec's §1.1 per-shape rules (variant discriminators, child rules, the Show*
  thresholds, `literal-array` placeholders).
- `src/app/VocabularySection.tsx` — the panel section: collapsible per entry, a
  widgets/display/all filter, and a guarded copy affordance.
- Wired into `src/app/WorkbookPanel.tsx`; the report header button is now
  `Workbook` / `Close workbook` (`src/App.tsx`).

### Gate coverage

| Gate | Test |
|---|---|
| G-DN-A1 | `src/app/vocabulary.test.ts` — enumerates `componentNames`, never a literal list |
| G-DN-A2 | same — widget/container markers; `Chart`'s discriminator and its per-variant `x`/`y` and `histogram.value` |
| G-DN-A3 | same — **every** snippet parsed by the real `parseTemplate` and run through the real `validateTemplate`, asserting zero error diagnostics, one test per catalog entry (19 of them) so a future entry cannot regress silently |
| G-DN-A4 | same — `widgets` = `WIDGETS`, `components` = its exact complement, unset = all |
| G-DN-A5 | `src/app/VocabularySection.test.tsx` — static render with no host transport |
| G-DN-A6 | the header strings in `src/App.tsx` |

**All 19 snippets validate on the first implementation** — the spec's §1.1 per-shape
rules were sufficient, including the seven entries the adversarial pass identified as
impossible under the draft's attribute-only recipe (`Chart`, `Map`, `Facets`, `Params`,
`ShowAbove`, `ShowBelow`, and the `literal-array` carriers).

### Also landed with Part A

- **A platform guard against the DN-R5 hazard** (`src/app/platformGuards.test.ts`): no
  module may *statically value-import* `@immediately-run/sdk` or `…/tasks`, which
  register a host listener at module load and throw with no transport. `import type`,
  the `mounts` subpath and `await import()` are all correctly not matched — proven by
  fault injection over five cases, not by inspection. This guard exists **before** Part B
  needs it, so the mistake cannot be made later.
- **A lint-red `main` fixed** — R3-427 shipped an unused-binding error because the
  verification command piped `npm run lint` into `tail`, and a pipeline's exit status is
  the *last* command's, so the `&&` chain continued past a failing gate. Fixed here, and
  the lesson is worth keeping: **never pipe a gate into `tail`/`head` in a chained
  verification** — capture to a file and check the exit code.

## Part B — the edit affordance (R3-447: the contract established, the build landed)

**Phase 1 — the preconditions, established 2026-09-22** (the worker-VM agent venue:
current-main dev host + staging backend/Firestore, the real repo-load dispatch, a
workbook corpus repo dispatched by URL; browser-driven observation off the live
channel, per the spec's rule — an injected port cannot falsify a question about the
host):

| # | Answer (with how it was established) |
|---|---|
| P1 | A `type: 'content'` dispatch mount carries `id` in the **universal `scheme:locator` form** — observed live as `content:immediately-run-worker/r3-447-workbook` (the frame's own mount service, `getMounts()`). `capFile`'s `mountId` is therefore addressed with the descriptor's `id` verbatim; the host's grant lookup is an **exact match** on it (`taskInvocation.ts` → `grantFor`), and no fallback is documented — a path-shaped or bare `mountId` would refuse `forbidden`, which is why the door fails closed on an id-less mount rather than making a doomed call. The unqualified form is not what the host mints. |
| P2 | The mount **reports `mode`** — observed live as `'rw'` on the repo-load dispatch (writes land in the corpus mount; proposing back to the source repo stays unwired, the RCD §5.1 disclosure) — and **`rules: null`** (no rules). The editability derivation therefore keys on the **positive `rw` check** R-EFE-1 prescribes; the draft's "absent ⇒ writable" inversion (DN-R2) is dead, and the `subtree`-comparability question (DN-R3) dissolves — there are no rules to compare. This repo's dispatch fixtures stamp `mode: 'ro'`; the live repo-load mount stamps `rw` — the fixtures model the task-invocation shape, not this one. |
| P3 | **Both channels are real and shaped as §4.2 handles them.** Documented half (the host's task contract, `taskContracts.ts`): `edit-file` returns `{ saved: boolean }` — `saved: false` is the result-carried refusal, and `invokeTask` throws machine `.code` rejections (`cancelled`, `forbidden`, …). Live half (a real invocation from the dispatched frame): exercised by the gates below — it required P4's grant first, which is the sequencing finding, not a gap. |
| P4 | **NO — and deliberately so.** The build-default binding (`site-main` `registry/defaults.ts`, `task.open-workbook`) omitted `task:invoke` with a comment naming this milestone as the moment to add it; the frame's live grant-filtered catalog carried no task verb. The grant half is site-main's R3-447 registry diff (this milestone); the manifest `invokes` declaration (this repo) is the self-restriction half — G-DN-B10 asserts both. |
| P5 | **The dispatched shape is reachable and renders.** Driven live: a workbook corpus repo (the Meridian seed as real files + `immediately.run.json` marker `opensWith: open-workbook@1.0`) dispatched by URL through the real repo-load branch — stock reckoner from the registry binding rendered the report (nav, growth-composition sections, the workbook panel). The honest sequencing notes: **no workbook corpus repo existed** (the corpus is content work, not platform work — the spike's corpus is temporary), and **no user-facing caller invokes the task** (the `opensWith` marker's only reader is the URL route; the folder-trigger caller is R3-267) — the URL route is the reachable shape. |

**Phase 2 — built** (the same item): the inspector's per-row edit door (`ValueInspector`),
the §4.3 path gate (`documentPaths`), the door itself (`useEditFile` — lazy import, both
refusal channels, the session-scoped latch, the host-less no-op, the §4.4 staleness
signal), the staleness notice + reload (`DocumentChangedNotice`, `useReport.reload`),
the `invokes` declaration, and site-main's `task:invoke` grant. Q6 (the consumer
inspector's door) resolves per the item's own Phase-2 surface ("the inspector's formula
and test rows"); Q3 (reload vs change-watch) resolves to the **reload affordance** — a
change-watch needs an fs watch the task-delegated export does not carry
(SPACES_UI §6.6 / R3-732's seam).

### Gate coverage

| Gate | Test |
|---|---|
| G-DN-B1 | `dispatch.test.ts` — the ok resolution carries the live mount (id/mode provenance); the live descriptor read on the venue (above) |
| G-DN-B2 | `useEditFile.test.ts` — writability by the positive `rw` check (ro/absent are not doors) |
| G-DN-B3 | `documentPaths.test.ts` — segment-boundary traversal refusal; `useEditFile.test.ts` — a failing path never constructs the delegation |
| G-DN-B4 | `useEditFile.test.ts` — the call addresses the descriptor id (universal form); an id-less mount is not a door (fail-closed — the host's exact-match grant lookup has no documented fallback); the live invocation gate below |
| G-DN-B5 | `useEditFile.test.ts` — both channels: thrown `cancelled`/`forbidden`/`timeout`, the result-carried `{saved:false}` refusal, the host-less no-op; the live gate below |
| G-DN-B6 | `ValueInspector.test.tsx` — absent unless writable (per row), present beside both anchors, the disclosure at the button, the click hands the row's path; the live gate below |
| G-DN-B7 | `documentPaths.test.ts` — traversal-shaped `manifest.worksheets` paths never reach `capFile` |
| G-DN-B8 | the pre-existing `platformGuards.test.ts` (no static tasks import) + `useEditFile.test.ts`'s host-less no-op case |
| G-DN-B9 | `DocumentChangedNotice.test.tsx` + `useReport.test.tsx` (the reload); the live gate below |
| G-DN-B10 | `package.json` `invokes` (this repo) + site-main's registry diff and its exact-list test |

**The host-exercised halves (P1–P4's live legs: a real `edit-file` invocation from the
dispatched frame — the door visible on the dispatched shape, the overlay opening, both
refusal channels observed on the real gate, the staleness affordance after a save) run
on the venue against the merged mains before R3-447 archives; the unit halves above are
in-repo and green.**

## Open residuals

**`edit-table` is now specified** (2026-08-29) — `EDIT_TABLE_TASK_SPEC.mdx` in the docs
repo, proposal rev 2 after an adversarial pass. It is **blocked on P1–P5 above plus two
of its own** (~~P6: task-delegation mounts are announced with no `mode`~~ — **closed
2026-09-29 by the R3-754 probe below: the delegation mount announces `mode: 'ro'`**
(the `min(caller grant, cap, contract)` stamp, site-main `mintDelegations.ts`), so the
read-only rule IS implementable; P7: Reckoner has no fs watch, so the autosave safety argument
has no consumer). R3-447's host spike therefore unblocks both surfaces, not just
Part B — worth knowing before scoping it. The 2026-08-29 review also confirmed the
seed-vs-mount wall applies to fixtures exactly as it does to worksheets: on the
bundled-seed path there is no file to delegate, only a string in `src/seed/`.

Spec §6 (`edit-table`, open-at-line, Delta B, click-to-insert, own-source editing) and
§11 Q1–Q7 — including the two the review surfaced as real decisions rather than
deferrals: whether the consumer-visible inspector carries an authoring door (Q6), and
the template-file edit row without which "copy the snippet, open the template" has no
door (Q7).

### The second dispatch shape's descriptor (R3-754, probed live 2026-09-29)

Probed on the venue (staging composition, driven Chromium, the venue identity signed
in): the corpus open in the editor, file-explorer's `opensWith` affordance on the
corpus root ("Open as workbook"), the task overlay running reckoner. The frame's own
mount set, read from the callee:

```json
{ "id": "/task/task-1/dir", "path": "/task/task-1/dir",
  "type": "task-delegation", "mode": "ro", "rules": null }
```

with the task input `{ task: 'open-workbook', params: { dir: '/task/task-1/dir' } }` —
the host REWRITES the caller's `dir` to the minted chroot path, and the mount's `id`
is that same path (NOT the universal `scheme:locator` form P1 established for
`type: 'content'` mounts — the two shapes address differently, and `dispatch.ts`'s
task branch addresses the delegation by the path-form id it arrives with).

The mode is **`ro` even when the caller's session holds the corpus read-write** (the
edit session's worktree): `panel.files`'s published port of the worktree is itself
`ro`, so `min(…)` clamps to `ro` regardless of the session's writability. The edit
door therefore stays dark on every dispatch-driven open — by design, pending R3-797 —
and the URL/task dispatch shapes are recorded **view-only** (the owner's 2026-09-28
decision (c) on R3-754).

### The live gates (2026-09-22, the venue run against BOTH merged mains) — two pass, one is a FINDING

Driven on the worker-VM venue with site-main at 60ddd0a and reckoner@main at 2925fa4
(both PRs merged), the corpus dispatched by URL:

- **G-DN-B6 live: PASS.** The door renders beside both `file:line` anchors
  (`worksheets/review.sheet.js:3` and `:107`) on the dispatched shape, with the RCD
  §5.1 disclosure on the button title AND the visible note line.
- **G-DN-B5 live (the forbidden channel): PASS.** A refused invocation draws exactly
  one plain message ("This document can't be edited here.") and latches the door off —
  observed live, matching §4.2 to the letter.
- **G-DN-B4 live (the successful invocation): BLOCKED BY A FINDING, not a bug in this
  repo's half.** The invocation refuses `forbidden — 'protocol-task.invoke' requires
  the 'task:invoke' capability; this app's grant does not hold it` — **despite
  site-main#584 being merged and the venue serving it**. Root cause (code + live):
  the URL repo-load dispatch resolves the *viewer's repo* from the `task.open-workbook`
  binding, but the frame's **grant** is the preview/stage grant — the registry row's
  capabilities never flow to the repo-load-dispatched frame. The task-invocation shape
  (where the binding's grant does apply) is unreachable twice over: no user-facing
  caller exists (R3-267), and this repo's `dispatch.ts` v1 deliberately resolves only
  the repo-load shape. **The affordance is therefore unreachable on both dispatch
  shapes — DN-R12's failure mode reborn at the invocation layer.** The fix is a
  design decision the owner owns (the repo-load dispatch minting the viewer's grant
  from the task binding; or the preview grant widening; or shipping the task-shape
  caller); recorded in R3-447's roadmap status, which stays **in-progress, unarchived**.

### The live gates on the rw dispatch shape (2026-10-01, the venue; R3-797's grant + edit-file#10) — the remaining halves PASS

Driven on the worker-VM venue (staging composition; site-main main 096ce08; STOCK
reckoner; corpus `immediately-run-worker/r3-447-workbook` URL-dispatched, the corpus
publishing **rw** since R3-797), with the empty-read blocker root-caused and fixed
first:

- **The 2026-09-22 B4 finding is resolved in two layers.** The grant layer was fixed by
  R3-754 (grant flows to the dispatched frame) and R3-797 (the corpus publishes `rw`
  under dispatch). The layer those legs exposed — the edit-file overlay rendering
  "New or unreadable file — starting empty" on a healthy delegation — was **app-side,
  not host-side**: the edit-file app's `src/fs.ts` read
  `module.evaluation.module.bundler.fs`, the object the SDK's fs module names as the
  documented WRONG one (no `promises`/`stat`). Every read threw before any RPC left
  the frame (proven by a host-side op trace: zero ops after the edit click), and the
  callee's catch rendered the empty state. The same chroot path read through the
  supported surface (`__sandpackSharedFs`) returned the file's bytes. Fixed in
  **edit-file#10** (delegate to `@immediately-run/sdk/fs` `sandboxFs()`; SDK pinned
  0.75.0 — `^0.13.0` predates the SDK's `/fs` subpath, so the bump was forced).
- **G-DN-B4 live (read + save + value provenance): PASS.** The edit chip on
  `review.total`'s inspector opens the overlay, which now READS
  `worksheets/review.sheet.js` (real bytes). A probe edit (the `total` formula ×2)
  saved through the delegation — `completeTask({saved:true})`, overlay closed — and a
  re-opened editor showed the SAVED bytes. After reload the report rendered the
  doubled figure (409,994 → 819,988): the save landed in the corpus mount and the
  report's re-read sees it. The original bytes were saved back and the report
  re-verified at 409,994 (the venue drive is byte-net-zero; the corpus repo itself
  never receives the write — the CoW overlay is the save target, RCD §5.1 as
  disclosed).
- **G-DN-B5 live (the cancel channel, on the rw shape): PASS.** Dismissing the editor
  (Cancel) is silent — no notice — and does NOT latch the door (the chips stay
  rendered, matching the §4.2 latch's mount-state keying). The forbidden channel
  passed live 2026-09-22 (above) and is unchanged by the rw shape.
- **G-DN-B9 live (staleness + reload): PASS.** The save flipped the §4.4 signal: the
  notice rendered ("The mounted document changed after this report was rendered — the
  figures below are stale.") with the Reload affordance, and Reload re-read the
  document through the same mount resolution (the doubled value rendered).
- **G-DN-B6 live on the rw shape: PASS (re-run).** Both `edit` chips render beside the
  `file:line` anchors with the RCD §5.1 disclosure on the title AND the note line.

Every Part B gate is now covered: the gates whose evidence is host questions
(P1–P4, established live 2026-09-22) back B1–B4, B6 and B10; B4/B5/B6/B9 have the
live venue legs recorded here and on 2026-09-22; B1–B3, B7, B8 and B10 carry their
unit halves per the table above. Two B5 corners stay unexercised live, by shape
rather than omission: the result-carried `{saved:false}` refusal
(`useEditFile.test.ts`) needs the callee to complete without a save on a writable
mount — no shipped callee path produces it (cancel throws `cancelled`, an `ro`
mount never renders the door) — and `no-such-task` was never observed live; both
ride the §4.2 generic branch (name the code), asserted unit-side via `timeout`
(`useEditFile.test.ts`) and the contract shapes.
