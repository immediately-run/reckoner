# Reckoner M1 — build handoff

**Purpose.** Pick up the Reckoner M1 build in a fresh session. This records what is built
(the pure spine + the SES engine shell, all merged), how it is organized and verified, the
working conventions, the environment quirks, and the concrete next steps. · **Updated:** 2026-07-12

> **Reads first, in order:** `product_definition.md` → `ARCHITECTURE_PLAN.md` §2 (the five
> parts), §3 (document model + stdlib + templates), §4 (engine), §6 (testing), §10
> (milestones) → `AXIS2_SELF_HOSTING_WORKITEMS.md` + §0.2 (dogfooding) → `spikes/S5_SES_MODULE_RESOLUTION.md`.
> The canonical security architecture is `REPORTING_SPREADSHEET_SPEC.md`; adversarial
> findings are folded into `ARCHITECTURE_PLAN.md` §13 — **don't relitigate those.**

---

## 1. Current state — the pure spine + engine shell are built and merged

Reckoner went from the starter template to a tested formula-engine core. Everything below is
on `main` (PRs #2–#10; #9 is the S5 spike doc). **201 vitest cases**; every merge was green on
`tsc -b` + `npm test` + `npm run lint` + `npm run build`.

| Area | Where | What it provides |
|---|---|---|
| **stdlib** (complete) | `src/stdlib/` | The entire pure formula vocabulary. `table()` fluent + free functions: shaping (`filter`/`derive`/`sort`/`groupBy`/`rollup`/`join`/`antiJoin`/`pivot`/`topN`), aggregators (`sum`/`mean`/`median`/`count`/`min`/`max`/`quantile`/`first`), ordered (`lag`/`lead`/`scan`+`cumsum`/`cummax`/`ema`/`asofJoin`), dates (`monthKey`/`addMonths`/`resolveRange`/…), nulls (`coalesce`/`safeDiv`), screening (`trend`/`outliers`/`deltas`), event-time `window()`. Plus `cell()`/`testCell()` constructors, input-spec parsing (`parseInput`), metamorphic relations (`conservation`/`permutationInvariance`/`scaleInvariance`/`property`), assertions (`expectClose`/`expectEqual`/`deepEqual`), and the self-description `catalog`. Barrel: `src/stdlib/index.ts`. |
| **document model** | `src/document/` | `parseManifest` (`reckoner.json` + compat envelope), `parseFeedConfig` (inline-secret guard), `parseFixtureFrame`, `loadDocument(reader, root)` (port-injected fs), `resolveCompat` (run/degrade/refuse) on a minimal `semver` matcher. |
| **engine** | `src/engine/` | The recalc core: `buildGraph` (wildcard expansion + enumerability guards), `analyze`/cycle detection, tier lattice (`meetTiers`), content-`hash`, `Scheduler` (topo order, tier fold, `(value,tier)` cutoff, incremental recompute), `runTest`/`classifyCell`/`runSuite` (review verdict). **Engine shell:** `evaluateWorksheet` (SES-confined worksheet eval, `compartment.ts`) + the `Engine` orchestrator (`engine.ts`) that runs the whole spine. |
| **report** | `src/report/` | The template layer: `nodes.ts` (render-as-data node model), `catalog.ts` (closed v1 component catalog + attribute schemas), `validateTemplate` (binding collection + authoring diagnostics + structural rules). **Types + validation only — no React components yet.** |

**S5 is closed positive** (`spikes/S5_SES_MODULE_RESOLUTION.md`): the platform module-fetch
path resolves SES + CodeMirror and a starved SES `Compartment` runs in-platform, so the engine
realm is buildable in-platform. `Engine.fromSources(...)` already proves the SES-confined
pipeline in Node with the real `ses` package.

---

## 2. What remains — the effectful shells (in recommended order)

The pure spine is done; a runnable M1 static report needs three browser/SES shells. Each plugs
into the existing pure modules — **do not rewrite the core; wrap it.**

### A. Report-view React components + MDX→node parse (`ARCHITECTURE_PLAN` §3.3/§3.3.1)

Build the catalog components that render `src/report/nodes.ts` against `Engine` results.

- One React component per catalog entry (`catalog.ts` is the source of truth for names/attrs):
  `Kpi`, `Chart` (SVG; the `kind` variants), `Table`, `Value`, `Facets`, `Params` + widgets,
  `Section`/`Row`, `Callout`, `Map`, `Gauge`, `ShowAbove`/`ShowBelow`.
- A **renderer** that walks `TemplateNode[]`, instantiates the audited component per node
  name, and resolves each `source` binding to its `Engine` value **+ tier**. Collect the
  binding set with the existing `validateTemplate(...).bindings`.
- **Degraded states are component-owned** (§3.3): bound cell threw → marked broken tile; unknown
  component → placeholder (already flagged by the validator); unconsented feed → "needs access".
- **Do NOT draw your own tier/trust badge** — the host renders it (review-1 H2). Reserve the slot.
- Responsive lives in the components (container queries, SVG-first), never in the template (§3.3.1).
- A minimal MDX-subset → `TemplateNode[]` parser (platform delta D3 is the eventual home; for
  dev, a small parser that captures literal vs inert attributes per `nodes.ts`).
- **Verify:** unit-render components against mock `Engine` results; then live on the stack.

### B. `App.tsx` integration — a runnable static report (§2.1, §7)

Wire it together: `App.tsx` loads a document (`loadDocument` over the app's fs mount) →
`Engine.fromSources(worksheetSources, stdlib)` → `engine.run(externals)` → render the template
(A) against results. This is the **M1 exit gate**: a static doc opens with zero prompts and
renders, desktop + mobile.

- **Verify live** on `immediately.run` via the local provider + Chrome MCP (or the puppeteer-core
  fallback — see §4). The Meridian case study (`docs/case-study/meridian/`) is the corpus.

### C. Engine worker wiring (§4.1, §2.1)

Make the engine a sibling entry point (`src/entry/engine.tsx`) hosting a Web Worker; in the
worker, `lockdown()` then a `Compartment` per document (the S5-proven pattern), with
host-brokered input/result channels over `postMessage`. Wrap the pure `Scheduler` +
`compartment.ts`. Implement the async invariants deferred from the scheduler:
**single-slot run-to-completion supersession, the common-epoch barrier (glitch-freedom under
live feeds), and the watchdog circuit breaker** (§4.1). This is the step that makes the real
four-realm composite shape (`ARCHITECTURE_PLAN` §2.1) real.

---

## 3. Working conventions (honor these)

- **Protocol:** the `next-roadmap-item` skill's flow. Each code change in a **dedicated git
  worktree** off `origin/main` (or stacked on an open branch), a PR per repo, verified against
  the exit criteria, worktree removed after the PR is up. Reckoner is a normal repo (PRs);
  only the `docs` repo commits directly to `main`.
- **Verify gate (run before every PR):** `npx tsc -b` · `npm test` (vitest) · `npm run lint`
  (the Fast-Refresh rule) · `npm run build`. All must be green.
- **tsconfig constraints** (they bite): `erasableSyntaxOnly` (no `enum`/`namespace`/parameter
  properties — use union literals + explicit fields), `verbatimModuleSyntax` (`import type` for
  types), `noUnusedLocals`/`noUnusedParameters`, and tseslint `no-explicit-any` (use `unknown`/
  `Value`/generics). Imports use explicit `.ts` extensions (`allowImportingTsExtensions`).
- **The load-bearing design principle:** *separate pure logic from the effectful collaborator,
  and inject the collaborator as a port.* The whole spine is offline-testable because the
  effectful bits are ports: the scheduler's `Evaluator`, the test runner's `reevaluate`, the
  document loader's `DocumentReader`, the engine's SES `Compartment`. Keep this — a new shell
  should expose its effect as an injected port so its logic stays unit-testable.
- **New formula-facing callable → add a self-description** to `src/stdlib/catalog.ts`. The
  `catalog.test.ts` gate fails if an exported callable is undescribed (or a description orphaned).
- **CLAUDE.md** (repo root) is the app-authoring contract (entry is `App.tsx`'s default export;
  a component file exports only components; delegate editing to the platform editor; etc.).

---

## 4. Environment

- **Bring the local stack up when `local.immediately.run` 502s** — see the `local-stack-bringup`
  memory (`docs/.claude/memory/` in the `docs` repo) and the S5 spike's reproduce section:
  nginx → `:3000` site-main (`BROWSER=none npm start`), `:1234` sandbox
  (`npx parcel ./src/index.html --port 1234`, bypassing the stale-`dist/` predev guard), `:4000`
  backend (root 404 is normal).
- **Chrome DevTools MCP** is the intended live-debug tool. If it is down, drive the host headless
  with **`puppeteer-core` → system Chrome** (`acceptInsecureCerts` + `--ignore-certificate-errors`
  for the local nginx cert + `--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests`
  for the loopback provider fetch). The app renders in the sandbox's **nested iframe**, so scan
  `page.frames()` and read a `console.log` marker. Keep any driver-only dep out of the served
  app's `package.json`. (A worked example lived in the session scratchpad `ses-spike/`.)
- **Run an app on the real host with no commit:** `immediately.run dev . --origin https://local.immediately.run --json`
  → open the printed `/edit/…/live#ir-endpoint=…&ir-token=…` link.

---

## 5. Deferred-items registry (noted in code; don't lose these)

- **stdlib** — none outstanding (the tail — screening + `window()` — landed in #7).
- **document model** — host-side `compat` *derivation* by static analysis at save time (this
  module validates/resolves an existing envelope); cross-reference validation (an input naming a
  missing feed/fixture). (`src/document/index.ts`.)
- **engine scheduler** — the async half: single-slot supersession, common-epoch barrier,
  watchdog circuit breaker (`src/engine/scheduler.ts` header; do these in shell C).
- **engine shell** — worker/iframe host-brokered channels + `lockdown()` in the worker; the
  transpiled-module **linker** (the current evaluator uses a source transform + `Compartment.evaluate`;
  in-platform the sandbox transpiles and the Compartment module loader links); holdout-fixture
  **substitution** test semantics — running a subject over a test's own fixture inputs (§6). (`src/engine/engine.ts`/`compartment.ts`.)
- **report** — the React component implementations + MDX→node parser (shell A); host-rendered
  tier badges; data-shape contracts needing the resolved value. (`src/report/index.ts`.)
- **relations** — the M2 test runner supplies the metamorphic re-evaluation; the relation
  descriptors carry only their pure transform + comparison (`src/stdlib/relations.ts`).

## 6. Dogfooding note (Axis-2)

Per §0.2: document **content** is fully in-platform authorable now (S1); document **test runs**
are in-platform by construction once the engine runs (S2); **S5 is proven** so the engine/editor
*source realms are buildable in-platform*; the remaining self-hosting gap is **S4b** (an
in-platform Node-equivalent CI gate for `build`/`lint`/`vitest` of the TS source) — until it
lands, source-level CI (the verify gate above) stays external, which is the honest exception.
