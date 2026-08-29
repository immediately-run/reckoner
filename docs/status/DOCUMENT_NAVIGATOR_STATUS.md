# DOCUMENT_NAVIGATOR — implementation status

**Status:** **Part A implemented (R3-446); Part B blocked, not started (R3-447)** ·
**Updated:** 2026-08-28

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

## Part B — the edit affordance (blocked; nothing implemented)

Design only, in the spec's §3–§5. **Five preconditions**, none answerable from this repo,
each fatal if guessed (spec §5, from BLOCKERs DN-R1/R2/R4/R6 and MAJOR DN-R12):

| # | Must establish |
|---|---|
| P1 | What a `type: 'content'` dispatch mount carries as `id`, and whether `capFile`'s `mountId` takes it unqualified or scheme-qualified |
| P2 | What that mount reports for `mode`/`rules`, and whether `rules.subtree`'s "backend-natural" paths are comparable to document-relative paths |
| P3 | Which channel carries an `edit-file` `read-only` refusal — rejection or result — and its shape |
| P4 | Whether Reckoner's registry binding holds `task:invoke` (the manifest `invokes` is a self-restriction, never a grant) |
| P5 | Whether a user can reach the dispatched shape at all today |

**The rule:** P1–P4 are established **against a real host** (browser-driven observation
per this repo's debugging guidance — an injected port cannot falsify a question about
the host), and P5 answered, before any Part B code lands. R3-447 owns that.

## Open residuals

Spec §6 (`edit-table`, open-at-line, Delta B, click-to-insert, own-source editing) and
§11 Q1–Q7 — including the two the review surfaced as real decisions rather than
deferrals: whether the consumer-visible inspector carries an authoring door (Q6), and
the template-file edit row without which "copy the snippet, open the template" has no
door (Q7).
