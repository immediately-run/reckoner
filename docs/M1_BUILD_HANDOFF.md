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

## 1. Current state — the pure spine, engine shell, and report-view shell (A) are built

Reckoner went from the starter template to a tested formula-engine core plus the report-view
render surface. Everything below is on `main` (PRs #2–#10; #9 is the S5 spike doc) except the
report-view render layer (shell A), which is in its own PR. **242 vitest cases**; every merge was
green on `tsc -b` + `npm test` + `npm run lint` + `npm run build`.

| Area | Where | What it provides |
|---|---|---|
| **stdlib** (complete) | `src/stdlib/` | The entire pure formula vocabulary. `table()` fluent + free functions: shaping (`filter`/`derive`/`sort`/`groupBy`/`rollup`/`join`/`antiJoin`/`pivot`/`topN`), aggregators (`sum`/`mean`/`median`/`count`/`min`/`max`/`quantile`/`first`), ordered (`lag`/`lead`/`scan`+`cumsum`/`cummax`/`ema`/`asofJoin`), dates (`monthKey`/`addMonths`/`resolveRange`/…), nulls (`coalesce`/`safeDiv`), screening (`trend`/`outliers`/`deltas`), event-time `window()`. Plus `cell()`/`testCell()` constructors, input-spec parsing (`parseInput`), metamorphic relations (`conservation`/`permutationInvariance`/`scaleInvariance`/`property`), assertions (`expectClose`/`expectEqual`/`deepEqual`), and the self-description `catalog`. Barrel: `src/stdlib/index.ts`. |
| **document model** | `src/document/` | `parseManifest` (`reckoner.json` + compat envelope), `parseFeedConfig` (inline-secret guard), `parseFixtureFrame`, `loadDocument(reader, root)` (port-injected fs), `resolveCompat` (run/degrade/refuse) on a minimal `semver` matcher. |
| **engine** | `src/engine/` | The recalc core: `buildGraph` (wildcard expansion + enumerability guards), `analyze`/cycle detection, tier lattice (`meetTiers`), content-`hash`, `Scheduler` (topo order, tier fold, `(value,tier)` cutoff, incremental recompute), `runTest`/`classifyCell`/`runSuite` (review verdict). **Engine shell:** `evaluateWorksheet` (SES-confined worksheet eval, `compartment.ts`) + the `Engine` orchestrator (`engine.ts`) that runs the whole spine. |
| **report — types + validation** | `src/report/` | The template layer contract: `nodes.ts` (render-as-data node model), `catalog.ts` (closed v1 component catalog + attribute schemas), `validateTemplate` (binding collection + authoring diagnostics + structural rules). |
| **report — render shell (A)** | `src/report/render/` + `src/report/parse/` | The React render surface (§3.3). `ReportView` walks a parsed `TemplateNode[]` and draws the audited components, resolving every `source` through the injected **`Bindings` port** (value + tier; shell B supplies the engine adapter). One component per catalog entry — `Kpi`, `Chart` (SVG: bar grouped/stacked/normalized, line, area, scatter, histogram, pie ≤5+other), `Table` (sortable), `Value`, `Facets` (small-multiples), `Gauge`, `Map` (point + region-breakdown choropleth), `Callout`, `Section`/`Row`, `ShowAbove`/`ShowBelow` (ResizeObserver/matchMedia), `Params` + `Select`/`Toggle`/`Range`/`DateRange`. Degraded states are component-owned (broken tile / needs-access / placeholder); the tier badge slot is **reserved** for the host (review-1 H2, never drawn here). Plus the safe MDX-subset parser (`parse/mdx.ts` + `parse/literal.ts`) — the dev stand-in for the platform D3 renderer; it **never evaluates** (`f={fetch("/x")}` → inert). Unit-rendered against mock engine results via `react-dom/server` (`render.test.tsx`) + parser/chart-math/format/shape tests. **Known v1 gap:** an inline component *within a prose line* parses to separate block nodes (block-level is covered); real polygon-geography Map and Kpi `spark` are deferred (see `src/report/render/index.ts`). |

**S5 is closed positive** (`spikes/S5_SES_MODULE_RESOLUTION.md`): the platform module-fetch
path resolves SES + CodeMirror and a starved SES `Compartment` runs in-platform, so the engine
realm is buildable in-platform. `Engine.fromSources(...)` already proves the SES-confined
pipeline in Node with the real `ses` package.

---

## 2. What remains — the effectful shells (in recommended order)

The pure spine and the **report-view render shell (A, done — §1)** are built; a runnable M1
static report now needs shell B (wire it into `App.tsx`) and shell C (the engine worker). Each
plugs into the existing pure modules — **do not rewrite the core; wrap it.**

### A. Report-view React components + MDX→node parse — **DONE** (`src/report/render`, `src/report/parse`)

Shipped in its own PR. `ReportView` + one component per catalog entry + the safe MDX-subset
parser, unit-rendered against mock engine results. The load-bearing seam shell B consumes: the
injected **`Bindings` port** (`src/report/render/bindings.ts`) — `resolve(source) → {value, tier,
status}` and `setParam(name, value)`. Shell B supplies a `Bindings` adapter over the engine's
`PassResult` + `params` externals; the renderer needs no other engine knowledge. Deferred
enrichments are listed in `src/report/render/index.ts` (host tier badge is a reserved slot; real
polygon Map; Kpi `spark`; full inline-MDX = the platform D3 renderer's remit).

### B. `App.tsx` integration — a runnable static report (§2.1, §7)  ← **next**

Wire it together: `App.tsx` loads a document (`loadDocument` over the app's fs mount) →
`Engine.fromSources(worksheetSources, stdlib)` → `engine.run(externals)` → parse each template
(`parseTemplate` from `src/report/parse`) → render via `<ReportView nodes bindings />` (A). This
is the **M1 exit gate**: a static doc opens with zero prompts and renders, desktop + mobile.

- **Build the `Bindings` adapter** (the one new integration piece): implement
  `src/report/render/bindings.ts`'s `Bindings` over the engine — `resolve(source)` returns the
  engine's published `{value, tier}` for a cell id / external key (or a `missing`/`error`
  status), and `setParam(name, value)` writes `params.<name>` and calls `engine.update(...)`,
  then re-renders. Keep it a thin adapter (the render side is already unit-tested against a
  hand-built port).
- **Verify live** on `immediately.run` via the local provider + Chrome MCP (or the puppeteer-core
  fallback — see §4). The Meridian case study (`docs/case-study/meridian/`) is the corpus.

### C. Engine worker wiring — **mostly DONE** (`src/engine/worker/`, `src/engine/asyncEngine.ts`, `src/entry/engine.ts`)

The executor realm is built and tested. The worker (`worker/engineWorker.ts` + the real
`entry/engine.ts` that `lockdown()`s and serves `build`/`eval` over `postMessage`) is a
terminable formula executor; the host `AsyncEngine` owns all scheduling + epoch/breaker state
(§4.1) and drives it over a `WorkerTransport` port (real Web Worker or an in-process double).
Delivered async invariants:

- **Watchdog circuit breaker** (§4.1) — a per-eval wall-clock budget; exceeding it is a hard
  runaway → the worker is `terminate()`d + rebuilt and the pure `CircuitBreaker` counts it;
  after `hardLimit` the cell **quarantines** and dependents resolve to the propagated **lattice
  error** (a re-arm recovers). Soft budget-exceed = confirm-before-stick + TTL decay. This is
  the availability protection SES cannot give (RQ-A4 residual).
- **Single-slot run-to-completion supersession** — overlapping `update()`s never cancel an
  in-flight pass; they coalesce to one follow-up with the latest externals (no cancel-restart
  livelock). Async formulas (a formula may return a promise) are awaited.
- Shared input resolution (`resolve.ts`) — one path with the sync `Scheduler` (refactored to
  use it), tier fold + `(value,tier)` publish, cycle→error-every-cell.

**Deferred (documented in `asyncEngine.ts`): the common-epoch barrier** for glitch-freedom
across asymmetric diamonds under a *continuous* live feed (§4.2 C-R-B). It is unexercised and
un-testable without feed connectors/conflation/windowing (none exist yet); with fixtures + user
param writes every pass settles at one epoch, so no cell assembles mixed-epoch inputs. It lands
with the live-feed workstream. **Also remaining:** wiring `AsyncEngine` into `App.tsx` in place
of the sync `Engine` (so even the static render runs off-main-thread with watchdog protection),
and the real-`Worker` E2E in a browser (the `entry/engine.ts` shim + `lockdown()` — thin, and
S5 already proved SES resolves + runs in-platform). Verified by the engine test suite
(sync-equivalence, error propagation, cycles, watchdog→quarantine→recover, supersession).

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
- **engine scheduler** — shell C shipped single-slot supersession + the watchdog circuit
  breaker (`src/engine/asyncEngine.ts` + `circuitBreaker.ts`). **Still deferred: the
  common-epoch barrier** (glitch-freedom under continuous live feeds — needs the feed machinery;
  see `asyncEngine.ts` header).
- **engine shell** — worker built (`src/engine/worker/`, `src/entry/engine.ts`). Remaining:
  wire `AsyncEngine` into `App.tsx`; real-`Worker` E2E in a browser; the transpiled-module
  **linker** (the evaluator uses a source transform + `Compartment.evaluate`; in-platform the
  sandbox transpiles and the Compartment module loader links); holdout-fixture **substitution**
  test semantics — running a subject over a test's own fixture inputs (§6). (`src/engine/engine.ts`/`compartment.ts`.)
- **report** — shell A shipped the components + MDX parser. Remaining/deferred (in
  `src/report/render/index.ts`): the **host-rendered tier badge** (the slot is reserved, we
  supply the value); a real **polygon-geography Map** (v1 choropleth ships a region breakdown);
  **Kpi `spark`** (needs a series binding the v1 catalog doesn't carry); full CommonMark +
  **inline-component-in-prose** (the platform D3 renderer's remit — block-level is covered).
- **relations** — the M2 test runner supplies the metamorphic re-evaluation; the relation
  descriptors carry only their pure transform + comparison (`src/stdlib/relations.ts`).

## 6. Dogfooding note (Axis-2)

Per §0.2: document **content** is fully in-platform authorable now (S1); document **test runs**
are in-platform by construction once the engine runs (S2); **S5 is proven** so the engine/editor
*source realms are buildable in-platform*; the remaining self-hosting gap is **S4b** (an
in-platform Node-equivalent CI gate for `build`/`lint`/`vitest` of the TS source) — until it
lands, source-level CI (the verify gate above) stays external, which is the honest exception.
