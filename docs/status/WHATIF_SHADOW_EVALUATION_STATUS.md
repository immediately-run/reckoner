# WHATIF_SHADOW_EVALUATION — implementation status

**Status:** implemented at the deliverable level (R3-395, R3-396, R3-397) · **Updated:** 2026-08-28

> *2026-08-28 — what-if panel collapsed by default (spec §1.1 amendment): the formula
> row gained the `what if →` door, the section auto-reopens while a variant differs from
> the document formula, and the duplicate formula rendering user feedback flagged is gone.*

This document is the single implementation-status source for
`docs/specs/WHATIF_SHADOW_EVALUATION_SPEC.md`; where they disagree, this document governs.

## Shipped (2026-08-27)

- **R3-395 — shadow-run core.** `AsyncEngine.settledSnapshot()` (quiescent, coherent,
  structured-clone-copied `(pass, externals)` pair — spec §2.1), `WorkerTransport.dispose()`
  (both transports), the line-anchored worksheet transform (spec §3.3), the
  unique-occurrence splice with typed refusals (`src/engine/shadow.ts`), source patching
  (variants + the reserved `scratch` worksheet), the dependents closure, the
  pinned-baseline value/verdict diffs, the shadow xref re-validation and the
  durable-subject scratch-test refusal (`src/app/whatif.ts`), and session retention of
  sources / loaded document / runtime feeds (`src/app/reportSession.ts`).
- **R3-396 — the what-if panel.** `src/app/WhatIfPanel.tsx` (effectful shell) +
  `src/app/WhatIfResult.tsx` (pure readout) under the value inspector dock; App-owned
  per-cell variant text (spec §1.4); explicit Run through `src/hooks/useShadowRunner.ts`.
- **R3-397 — the scratch pad.** `src/app/ScratchPad.tsx` in the workbook panel: buffer
  editor, Run, scratch cards through `WorkbookPanelBody`, collision disable, surfaced
  diagnostics/refusals, arm-then-confirm Clear, guarded Copy; App-owned buffer text.

## Gate coverage

| Gate | Test |
|---|---|
| G-WIF-1 | `src/engine/shadow.test.ts` (splice: unique / not-found / identical / substring) |
| G-WIF-1a | `src/engine/compartment.test.ts` (line-anchored transform round-trip) |
| G-WIF-2 | `src/app/whatif.test.ts` (base bit-identical; row-mutating variant contained) |
| G-WIF-3 | `src/app/whatif.test.ts` (settled coherence; feed buffers present; copies) |
| G-WIF-4 | `src/app/whatif.test.ts` (delta ⊆ closure; moving-base zero-delta) |
| G-WIF-5 | `src/app/whatif.test.ts` (scratch additive over values and cards) |
| G-WIF-6 | `src/app/whatif.test.ts` (variant flips shadow verdict; base untouched) |
| G-WIF-6a | `src/app/whatif.test.ts` (durable-subject scratch test refused) |
| G-WIF-7 | `src/engine/workerTransport.test.ts` (dispose delivers/accepts nothing) |
| G-WIF-8 | `src/engine/shadow.test.ts` + `src/app/ScratchPad.test.tsx` (collision refused/disabled) |
| G-WIF-9 | `src/app/whatifCaldera.test.ts` (real Caldera doc; oracle-matched outside closure) |
| G-WIF-10 | `src/app/whatif.test.ts` (typo'd external → visible diagnostic) |
| G-WIF-11 | App-owned buffer state (`src/App.tsx`) + arm-then-confirm Clear (`ScratchPad.tsx`); surface halves render-tested in `ScratchPad.test.tsx` |

## Measurements

- **Node harness (indicative only, not a browser claim — spec §2.3):** a full shadow run
  over the Caldera LBO document (build + pass incl. the 25-run sensitivity grid and the
  goal-seek + suite) completes in ~130 ms inside the vitest harness. The browser-side
  measurement the spec books before any continuous-evaluation mode (Q1) remains **open**.

## Open residuals (unchanged from the spec)

- In-process transport: no realm isolation/lockdown, and a synchronously divergent
  variant is unrecoverable (spec §5 — named residual; self-resolves with real workers
  in-platform; Q7 books the lockdown alternative).
- Splice refusal rate on short/duplicated formulas (span-on-descriptor is the booked
  successor, spec §10).
- Scratch-text reload persistence; apply/promote; sweeps; the structured mobile variant
  flow (Q6); ad-hoc scratch tests on durable subjects (Q5).
