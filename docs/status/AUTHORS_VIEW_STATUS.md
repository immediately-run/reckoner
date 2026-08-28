# AUTHORS_VIEW — implementation status

**Status:** implemented at the deliverable level (R3-433, R3-434) · **Updated:** 2026-08-28

This document is the single implementation-status source for
`docs/specs/AUTHORS_VIEW_SPEC.md`; where they disagree, this document governs.

## Shipped (2026-08-28)

- **R3-433 — core.** The four reflection components (`FormulaIndex`, `TestIndex`,
  `DataInventory`, `SuiteSummary`) in the catalog + `componentMap` + render layer
  (`src/report/render/reflectionContext.ts`, `verdictChip.ts`,
  `components/{FormulaIndex,TestIndex,DataInventory,SuiteSummary}.tsx`); the
  `ReflectionPort` with allowlisted fixture/feed summaries and credential-stripped hosts
  (`src/app/authorsView.ts`); template-role selection (reserved `authors_view` name +
  the new optional manifest `authorsView` key), the consumer pick excluding the
  author's view, per-template catalog validation, and the §6 consumer-template
  diagnostic (`src/app/reportSession.ts`).
- **R3-434 — surface.** The built-in scaffold with the `## Decisions.` convention
  (`src/app/authorsView.ts`), the rendered view with its header and Back
  (`src/app/AuthorsView.tsx`), the door in the workbook panel, the verdicts hoist —
  one app-level `useVerdicts` now drives the panel, the inspector, and the reflection
  port (G-AV-10; the prior second instantiation in the panel is removed) — and the
  `FORMULA_AUTHORING_PROMPT` *Recording the decision* standing duty with its labeled
  privacy boundary.

## Gate coverage

| Gate | Test |
|---|---|
| G-AV-1 | `src/app/authorsSession.test.ts` (scaffold when absent) + `authorsView.test.tsx` (full default render from a live port) |
| G-AV-2 | both files (document file replaces default; omitted index stays omitted) |
| G-AV-3 | `authorsSession.test.ts` + `authorsView.test.tsx` (selection; only-authors → empty report) |
| G-AV-4 | `authorsSession.test.ts` (manifest `authorsView` key) |
| G-AV-5 | `authorsView.test.tsx` (unknown worksheet → broken tile) |
| G-AV-6 | `authorsView.test.tsx` (panel-identical verdict classes; distinct pending; "Running suites…") |
| G-AV-7 | `authorsView.test.tsx` (no port → author's-view-only tile, all four components) |
| G-AV-8 | `authorsView.test.tsx` (scaffold parses + validates clean) |
| G-AV-9 | `authorsView.test.tsx` (derived shape; declared tier as plain data; query-string credential, path, and secretRef name never rendered) |
| G-AV-10 | By construction: `WorkbookPanel` no longer instantiates `useVerdicts` — it receives App's single instance as a prop (`src/App.tsx`, `src/app/WorkbookPanel.tsx`); the port takes the same object (`AuthorsView.tsx`). |

## Open residuals (unchanged from the spec)

- Materialize-on-customize (needs the write path); `<Include>`; per-cell editor deep
  links (R3-427); in-app deep-linking/routing for the view; the Q5 privacy-boundary
  mechanism; shared/anonymous deployment posture follows the workbook panel's.
