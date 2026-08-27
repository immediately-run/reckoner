# The sweep-idiom bake-off — protocol (R3-380)

**Status:** protocol landed 2026-08-27; **runs pending** (see §5 — what executing
them needs). The decision rule below is stated **before** any results, so the
outcome cannot be reverse-engineered from a preferred answer.

Companion to [`README.md`](README.md) and
[`../../LBO_CASE_STUDY_GAP_ANALYSIS.md`](../../LBO_CASE_STUDY_GAP_ANALYSIS.md) §2 G4:
Excel's two-way data table is two minutes of clicking; Reckoner's parameter sweep is a
model-as-function decomposition tax. The gap-closure plan (§3) decided: **measure
before building** — if agents author the sweep idiom reliably from self-descriptions
alone, an engine-level sweep construct is unnecessary; if not, the failure modes name
its requirements.

## 1 — The question, falsifiable

> Can a formula-authoring agent, given **only** the stdlib catalog
> self-descriptions (`catalog.ts`, RQ-A5) and the Caldera document's cells (excluding
> `model.sensitivity` itself), author the sensitivity cell — 25 full model re-runs —
> **first-attempt correct and diff-auditable**?

"First-attempt correct" and "diff-auditable" are the E-1 bar (the DSL bake-off's
criteria), re-used deliberately so the two bake-offs are comparable.

## 2 — The rig

- **Subjects.** N ≥ 10 independent agent runs (fresh session each; no memory of
  this repo). Vary model + temperature per the E-1 protocol.
- **Inputs given.** (a) the stdlib catalog self-descriptions, verbatim; (b) the
  Caldera document as shipped **minus** `model.sensitivity` and its tests; (c) the
  task: "add a cell that computes sponsor IRR and MOIC for exit multiple
  7.0–9.0x × TLB leverage 4.0–6.0x" — no idiom hints beyond what the catalog says.
- **Oracle.** The existing `expected.json.sensitivity_grid` — an agent's cell passes
  iff its 25 IRRs match to 1e-9. The oracle exists before the first run.
- **Loop.** The agent may run its cell against the document (the authoring loop's
  step 4) but each **test-informed revision counts as an attempt**; "first-attempt"
  = green with zero revisions.

## 3 — Scoring

Per run: attempts-to-green (1, 2, 3+), whether the solution used the idiom (pure
module-scope helpers + one map cell) vs. an anti-pattern (duplicated model logic,
reaching for nonexistent ambient state, hand-rolled rollforward/irr), and diff size
of the final worksheet vs. the shipped one.

## 4 — The decision rule (fixed now)

- **Idiom-reliable** ⇒ *the construct is rejected as unnecessary*: ≥ 8/10 runs
  first-attempt green with the idiom shape. Record in the gap-closure plan §3 and
  close G4.
- **Idiom-fails** ⇒ *the failure modes become the requirements list* for a `sweep()`
  design spike: < 8/10 first-attempt green, or ≥ 5/10 requiring revision to discover
  the model-as-function split (i.e. the catalog alone did not teach it).
- Either way the RESULT + the raw runs land in this directory; the decision is
  recorded with links, not prose memory.

## 5 — What executing this needs (honest state)

The assistant realm (the G12 harness that would run formula-authoring agents over a
live document) is not built — plan M2. Until it is, the runs cannot be executed
honestly, and **no substitute result will be fabricated** (a text-only "ask an LLM to
write the cell" drill lacks the run-the-cell loop that step 2 of the authoring loop
makes load-bearing). Reopen this file when the assistant realm lands; the protocol is
ready and the oracle already ships in `expected.json`.

## 6 — Provenance

Filed by R3-380 (project reckoner-lbo-gaps, W8/G4). The prompt half of the item —
the sweep idiom section in `docs/assistant/FORMULA_AUTHORING_PROMPT.md` — landed the
same day; note that its existence means the bake-off's "no idiom hints beyond the
catalog" arm must **exclude** that prompt text for the control condition (the
catalog is the surface an agent with only self-descriptions sees).
