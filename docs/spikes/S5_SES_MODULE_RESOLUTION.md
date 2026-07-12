# S5 spike — in-platform dependency resolution for SES + CodeMirror

**Status:** DONE — **positive** (live-confirmed 2026-07-12). · Axis-2 self-hosting item
**S5** from [`../AXIS2_SELF_HOSTING_WORKITEMS.md`](../AXIS2_SELF_HOSTING_WORKITEMS.md) and
`ARCHITECTURE_PLAN.md` §0.2 (S5 was booked as "spike *before* M1 source work").

## Question

Does immediately.run's in-browser **module-fetch path** resolve the two dependency families
the source realms need — **SES** (Hardened JavaScript, for the formula engine, `ARCHITECTURE_PLAN`
§4) and **CodeMirror** (the editor realm) — and does **Hardened JS actually run** inside the
sandboxed opaque-origin iframe? S5 was the gate on whether the **engine realm can be built
in-platform at all**.

## Method

A minimal immediately.run app (`scratchpad/ses-spike/`) that:

- `import 'ses'` (the side-effect shim that installs `lockdown`/`Compartment`/`harden`) and
  `import { EditorState } from '@codemirror/state'`;
- at module load — the production engine pattern — calls `lockdown()`, then checks: `harden`
  is installed, `new Compartment({x:21}).evaluate('x*2') === 42`, an undeclared global is
  **starved** (`new Compartment({}).evaluate('typeof fetch') === 'undefined'`), and CodeMirror
  resolved;
- logs the result to the console before any React work.

Served on the real host via the `local` provider
(`immediately.run dev . --origin https://local.immediately.run`) and driven headless
(`puppeteer-core` → system Chrome, `--ignore-certificate-errors` for the local nginx cert,
`--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests` for the
loopback provider fetch). The app renders in the sandbox's nested iframe; the driver reads the
`S5-RESULT` console marker and the iframe text.

## Result — ALL PASS

```
PASS — lockdown() runs
PASS — harden installed post-lockdown            (harden=function)
PASS — Compartment evaluates confined code       (evaluate("x*2")=42)
PASS — undeclared global starved in compartment  (typeof fetch=undefined)
PASS — CodeMirror resolves                        (EditorState.create=function)
```

Supporting evidence from the sandbox boot log:

- **Resolution works.** `[ir-perf:cdn-resolve] fastHits 829 · fallThroughs 82` — 829 modules
  resolved on the primary CDN, 82 fell through to the **esm.sh** fallback. COW created
  `/ses`, `/@endo/env-options`, `/@codemirror/state`, `/@marijn/find-cluster-break`,
  `/scheduler`, `/react`, … — i.e. `ses` **and its `@endo/*` deps** and the CodeMirror tree
  all resolved.
- `loadNodeModules 2133ms → ir.deps (Σ 3191ms)`; `request→interactive 3939ms` (cold, uncached).

## Verdict

**S5 is closed positive.** The module-fetch path resolves SES + CodeMirror, and a **starved
SES `Compartment` runs in-platform** — the engine realm's core security property (no ambient
`fetch` reachable from confined code) holds inside the sandboxed opaque-origin iframe. The
**engine realm (SES) and editor realm (CodeMirror) are buildable in-platform.**

Two independent corroborations:

- **CodeMirror was already proven** before this spike: the `immediately-run/editor` app depends
  on the full `@codemirror/*` set and runs as a production immediately.run app (editor-as-app).
- The resolution path is **blazingly.io** (primary CDN) → **esm.sh** (fallback, which serves
  `ses@2.2.0` as its `assert-shim`/`compartment-shim`/`lockdown-shim`/`ses.mjs` set); esm.sh is
  already in the sandbox `connect-src`, so no CSP change was needed.

## Caveats / scope

- The spike ran SES in the app's **render iframe** (calling `lockdown()` there disturbs React
  after the fact, which is why the result is logged to the console pre-render). **Production
  runs SES in a dedicated worker** inside the engine entry-point (`ARCHITECTURE_PLAN` §4), so
  lockdown-vs-React coexistence is a non-issue for the real engine — this spike only had to
  prove *resolution + Hardened-JS execution*, which it did.
- S5 is **distinct from S4b** (an in-platform Node-equivalent CI gate for `build`/`lint`/
  `vitest`/mutation of the TypeScript *source*). S4b remains a genuine gap; source-level CI
  stays external until it lands. S5 being positive does **not** close S4b.

## Reproduce

```bash
# stack up: sandbox parcel on :1234, site-main on :3000, behind the local nginx
cd sandbox && npx parcel ./src/index.html --port 1234 &          # (bypasses the stale-dist predev guard)
cd immediately-run-site-main && BROWSER=none npm start &          # :3000
# serve the spike app + drive it headless
cd scratchpad/ses-spike && immediately.run dev . --origin https://local.immediately.run --json
node drive.mjs "<printed /edit/.../live#… url>"
```
