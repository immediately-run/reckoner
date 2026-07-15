# Reckoner — Axis-2 self-hosting work items (dogfooding)

**Status:** work items — the first concrete Axis-2 (dogfooding) tasks from
`ARCHITECTURE_PLAN.md` §0.2. Reckoner forces not only the platform's *runtime* capabilities
(the nine deltas) but its ability to **host its own development**. These are the platform
self-hosting gaps that keep Reckoner development from being fully in-platform, scoped as
actionable items. · **Updated:** 2026-07-15

> **Reads first:** `ARCHITECTURE_PLAN.md` §0.2 (the dogfooding stance + the S1–S6 gradient),
> §10 (the in-platform work-item tags); `LOCAL_DEVELOPMENT_SPEC.md`, `EDITOR_AS_APP_SPEC.md`,
> `AGENT_AUTHORING_ARCHITECTURE.md` (the existing in-platform dev loop).

The remaining gating gap is **S4** (an in-platform Node-equivalent CI gate); **S3**
(in-platform commit/push) was resolved by reconciliation 2026-07-15 — the loop already ships
on `protocol-contribute` (see the §S3 correction note). S4 splits into a cheap in-platform
win and a hard platform capability. S1/S2/S5/S6 are listed for context with their status.

---

## S3 — In-platform commit & push (close the content-authoring loop)  · **near-term, high-leverage**

> *(Correction, 2026-07-15 — resolves roadmap R3-230 by reconciliation, not new code: the
> "current state" below was stale at verification. The write half of VCS already ships on the
> **`protocol-contribute`** surface, not `VcsControl`: `contribute()` (SDK) → `protocol-contribute
> run` (site-main `requestDispatcher.ts`) → the contribution orchestrator, whose `direct-commit`
> mode commits the CoW overlay and pushes (`updateRef`) to the mounted/designated branch —
> host-driven, token host-held, typed error events with non-fast-forward recovery. The editor
> affordance is the activity rail's "Source" panel (`panel.contribute`, the contribute-panel app,
> build-default `contribute:any` + first-party `contribute:direct`) with a commit-message box and
> a "Commit directly" mode, plus the `modal.contribute` save dialog. The acceptance bullets below
> are therefore met today; extending `VcsControl` with a parallel `commit` was rejected — it would
> add a second write path/gate for an authority whose single chokepoint is `protocol-contribute`
> (docs `ways_of_working` §2/§5).)*

**Goal.** An author editing Reckoner content (worksheets, templates, fixtures, docs) in the
platform editor can **commit and push to the designated branch without leaving the platform** —
no local git, no terminal.

**Current state (verified 2026-07-09).** The in-platform dev loop is *most* of the way there:
the editor holds an in-browser working tree with a Copy-on-Write overlay
(`LOCAL_DEVELOPMENT_SPEC` §6.2), the agent write-port (AA-23) can write to it, and the
`VcsControl` surface (`immediately-run-site-main/src/editor/requestDispatcher.ts` →
`VcsControl`) exposes **diff viewing, PR viewing, and working-tree reset**. What it does **not**
expose is the write half of VCS.

**Gap.** `VcsControl` has `refreshDiff` / `refreshPRs` / `resetWorkingTree` — but **no
`commit`, `push`, or `createBranch`.** The CoW overlay accumulates edits an author cannot land
from inside the platform; committing still requires dropping to local git (the exact "leave the
platform" step dogfooding is meant to remove).

**Deliverable.** Extend `VcsControl` (and the host-side VCS channel — `SandboxListener` →
`CHANNEL.vcs`) with a **host-driven commit + push** action: stage the CoW overlay → commit with
a message → push to the session's designated branch, gated on the same auth the platform already
holds (the user's GitHub identity, host-driven — the app never sees the token, `§8` credential
rule). Surface it as an editor affordance, not an app-rendered git UI.

**Acceptance.**
- An author edits a worksheet/template/doc in the editor, opens the VCS surface, writes a commit
  message, and the change lands on the designated branch — round-trip inside the platform.
- The app never handles the token; push uses the host-driven identity.
- Reset still works; a failed push surfaces a typed error, not a crash.

**In-platform tag:** ✅ (this *is* the item that makes S1's content loop fully in-platform).
**Owner:** `immediately-run-site-main` (editor VCS surface). **Depends on:** nothing new — the
working tree, auth, and VCS channel all exist; this is exposing the write half.

---

## S4 — In-platform test/CI gate  · **split: cheap win now, hard capability tracked**

**Goal.** The gates CLAUDE.md requires before "done" (`npm run build`, `npm run lint`,
`npm test`, mutation testing) are runnable **inside the platform**, so a dogfooded change can be
verified without external CI.

**Current state.** Split by what actually needs Node:

- **Document-level checks are already in-platform (S2).** Reckoner's tests-as-cells run **in the
  browser engine** (`ARCHITECTURE_PLAN §6`); a full-workbook test run is a browser operation.
  The **runtime** "build" is the browser transpile (no Node build step at runtime, per the
  immediately.run model). So a document's correctness gate is in-platform *by construction* once
  the engine lands (M1).
- **Source-level TS CI is a genuine Node gap.** `tsc` type-check, `eslint`, `vitest` over the
  *app/engine source*, and Stryker mutation testing are Node processes; nothing runs them
  in-browser today.

**Deliverable — two parts:**

- **S4a (cheap, now):** formalize the **in-platform document-test gate** — a one-action
  "run this workbook's suite" in the editor that runs all test-cells in the engine and reports
  pass/fail + kind-coverage + (later) mutation score, as the dogfooded equivalent of `npm test`
  **for document content**. Rides S2; no new platform capability. Ship with M1/M2.
- **S4b (hard, tracked capability):** an **in-platform Node-equivalent runner** for source-level
  `build`/`lint`/`unit-test`/`mutation` — either a platform-hosted ephemeral Node runner
  triggered from the editor, or (longer horizon) enough of the toolchain compiled to run in a
  worker. This is a real platform lift; **until it exists, source-level CI stays external** and
  that is the honest exception the §0.2 ✗ tag marks. Track it as a platform capability, not a
  v1 Reckoner deliverable.

**Acceptance.**
- **S4a:** an author runs the workbook suite from the editor and sees the same
  validated/pinned/untested verdicts the review surface shows — no terminal.
- **S4b (when built):** a source change's `build`+`lint`+`unit-test` verdict is available
  in-platform; until then, the plan/status honestly marks source CI as ✗ (external).

**In-platform tag:** S4a ◐ (with the M1 engine); S4b ✗ (needs the platform capability).
**Owner:** S4a Reckoner (editor integration of the engine test run); S4b `immediately-run-site-main`
+ platform. **Depends on:** S4a → the engine (M1) + S2; S4b → a platform runner (new).

---

## Context — the rest of the S-series (status only)

| # | Capability | State | Note |
|---|---|---|---|
| S1 | Edit → live-preview loop for content & source | ✅ exists | editor + agent write-port + `local` provider host preview |
| S2 | In-platform document-test execution | ◐ by construction at M1 | tests-as-cells run in the engine; S4a exposes it |
| **S3** | **In-platform commit/push** | ✅ **delivered** (reconciled 2026-07-15) | ships on `protocol-contribute` + the `panel.contribute` affordance — see the §S3 correction note |
| **S4** | **In-platform CI gate** | **S4a ◐ / S4b ✗ → this doc** | document tests in-platform; source CI is the tracked gap |
| S5 | Dep resolution for SES / CodeMirror in-platform | ✅ **proven** (2026-07-12) | live spike: the module-fetch path resolves `ses`+`@endo/*`+`@codemirror/*`, and a starved SES `Compartment` runs in-platform — see [`spikes/S5_SES_MODULE_RESOLUTION.md`](spikes/S5_SES_MODULE_RESOLUTION.md) |
| S6 | Run the real four-realm composite in-platform | ✗ gated on D1–D9 | the recursion; resolves as the deltas land (M3) — and needs Spine 2's topology to express a multi-appKey launch (`COMPOSITE_CAPABILITY_TOPOLOGY_SPEC` OQ-3) |

## Recommended order

1. **S3** — ✅ **delivered by reconciliation** (2026-07-15): the content-authoring commit/push
   loop already ships on `protocol-contribute` (see the §S3 correction note); no new code.
2. **S4a** — folds into the M1/M2 editor work; formalizes the document-test gate S2 already
   enables.
3. **S5 spike** — ✅ **DONE, positive** (2026-07-12): the module-fetch path resolves
   SES + CodeMirror and a starved SES `Compartment` runs in-platform, so the engine realm is
   buildable in-platform. Findings: [`spikes/S5_SES_MODULE_RESOLUTION.md`](spikes/S5_SES_MODULE_RESOLUTION.md).
4. **S4b / S6** — tracked platform capabilities, not v1 Reckoner deliverables; the honest ✗
   items whose closure is the deeper Axis-2 forcing-function contribution.
