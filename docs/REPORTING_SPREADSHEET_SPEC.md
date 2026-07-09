# immediately.run Reporting Spreadsheet — a JS-formula analysis app as a multi-sandbox composite

**Status:** proposal / draft — **the app *shape* is feasibility-resolved and is the forcing-function contribution; its *safety* is contingent on ~6 unbuilt platform deltas (one — host-enforced connector egress-fixing, §12 Q3 — is undesigned and the no-both invariant falls back onto it, RB-1) and carries booked residuals — safety is NOT yet resolved.** Two fresh-agent adversarial passes complete (§10b/§10c); a third on this revision is recommended. Design only; nothing here is built. · **Updated:** 2026-07-09

> **The single implementation-status source for this spec is `docs/status/REPORTING_SPREADSHEET_STATUS.md`** — where this document and that one disagree, the status doc governs. *(Status doc not yet created; this spec is the twice-reviewed author draft.)*

> **Reads first:** `context/core_concepts.md` §1/§3/§4/§5/§8/§9; `context/product_values.md` (value 2 run-mode-first, value 8 mobile); `TRUST_MODES_SPEC.md` §3 (M0–M3), §4 (personal/shared), §5 (interpreter/executor — **the interpreter/executor split is "a declared, inspectable design choice, *not* a capability gate … unprovable against side-eval"**, §5:152), §5.1 (non-executable MDX safe renderer), §6 (M3-egress `G1a`; "no capability policy rests on the user reading it"); `AGENT_AUTHORING_ARCHITECTURE.md` §2/§3.2/§5/§6/§7; `TRUST_AND_SAFETY_SPEC.md` TS-1/TS-3/TS-4/TS-5b/TS-19 (decision #2: maximally-explicit lines never bundled)/TS-19b; `UI_AS_APPS_SPEC.md` G12, G1a, §8.11 (host-proxied `net:fetch`); `HOST_ORIGIN_HARDENING_SPEC.md` §2.1; `STANDING_APP_LIFECYCLE_SPEC.md` §4.1/§5/§5.1/§6.1 (R-SAL-2; per-instance delegation; unbuilt floor-tier; mobile overlay); `WHITEBOARD_SPEC.md` §8.

---

## 0. Charter — the feasibility question and an honest answer  *(proposal)*

Two observations motivate this app: (1) spreadsheets carry vital reporting information but give poor means to build rich, live, interactive dashboards; (2) a spreadsheet is a **programming language** — if formulas were JavaScript, report logic would be a **unit-testable**, agent-authorable software artifact.

The question: **can formulas be JavaScript, and can dashboards be shared, without a security nightmare?**

> **The honest one-frame answer (corrected after two adversarial passes).** immediately.run already runs untrusted JS safely; the question is **"under whose authority does content-authored JS run, and what can it reach."** The answer *shape* — **four sandboxed realms so no realm holds two of {executes content-as-code, holds Class-B capabilities, hosts an injectable agent}**, with confidentiality defended as **reach, not egress** — is **feasible and is this spec's contribution.** But the *safety* of that shape is **not host-enforced by any single mechanism**: the no-both invariant is an **app-structural discipline** a malicious fork can weaken (§3.2/RB-1), backstopped only by mechanisms that are **unbuilt or undesigned** (per-instance output tiering §4; host-enforced connector egress-fixing §12 Q3). **The app's shape is the forcing function; its safety is a set of named, unbuilt platform requirements — not a resolved property.** This spec is valuable precisely as the honest enumeration of those requirements, not as a claim that the app is already safe.

This spec adds no new principal and no new capability tier; it composes existing mechanisms and names the new asks in §8.

---

## 1. The product  *(proposal)*

A **reporting spreadsheet**: JS/TS cell formulas, declarative report layouts (charts, tables, KPIs, prose) rendering live and interactively, **unit-tested** report logic, an embedded coding agent, and data that is **static (in-sheet), pulled (looked up), or live (streamed)**.

**Deployment continuum** (two-FS × trust-mode):

| Shape | Filesystems | App-code mode | Content mode | Character |
|---|---|---|---|---|
| Stock app + your content | FS1 ≠ FS2 | fixed, SDK-audited | varies (fenced) | portable, cross-org, public-safe |
| Fork + external content | FS1 ≠ FS2 | your/org fork (M1/M2) | shared space (M3) | org-customized |
| Fork + embedded content (fused) | FS1 = FS2 | org app (M2) | content *is* app source (M2) | purpose-built |

**Run-mode-first (value 2), stated up front (RB-5):** a dashboard with **only static / in-sheet data** (no live feed) MUST open with **no elevated powerbox and no connector** — the viewer just sees the report. The composite/connector consent (§6.2) appears only when a viewer **activates a live feed.** "Open a shared read-only dashboard" is a first-class, low-friction path, not a byproduct of the authoring composite.

---

## 2. The four-realm architecture  *(proposal — the core shape)*

Four sandboxed realms (distinct `appKeys`, distinct sandboxes) plus the host-owned safe renderer:

| Realm | Role | Executes content? | Holds | Trust mode |
|---|---|:--:|---|---|
| **Report view** (stage) | interpreter: renders layout + results | no | **Class-A only**: `rw@self` on the sheet, narrow feed-read | app-author's (M1/M2), M3 for a stranger's fork |
| **Formula engine** (evaluator) | executor: runs formulas + tests | **yes** | **nothing** (starved by app design) | — |
| **Data connector(s)** | ingestion: streams/looks up external data | no (a *dumb pipe*, §4.5) | elevated: `secrets:use`, `net:fetch` (**host-fixed targets, §12 Q3**), **per-instance-delegated** narrow source reads | app-author's (M1/M2) |
| **Assistant** (agent) | authoring: writes formulas/tests/layout | no | **Class-A only**: `llm:chat`, `rw@self`; catalog = the app's Class-A catalog (`G12`) | app-author's |
| *(host)* **Safe renderer** | compiles non-executable MDX → React | no | — | M0 |

This table is the **intended** structure. §3.2 states honestly how much of it the host actually enforces versus how much is app-structural discipline.

---

## 3. Security model  *(proposal)*

### 3.1 Confidentiality is reach, not egress — Class A vs Class B  *(proposal)*

Egress cannot be fully plugged even without `net:fetch` (`TRUST_MODES §6`: self-navigation leaks one small secret at browser-parity). So we bound **reach**, not egress (`core_concepts §9`):

- **Class A — the sheet's own content**: its cells + values from feeds bound to *this sheet*. Exfiltration is possible and **accepted unconditionally as a browser-parity residual** (§12). **"Disclosure" of this residual is best-effort defense-in-depth with no efficacy claim — no policy gates on the user reading it** (`TRUST_MODES §6`; RB-7). We do **not** claim the leak is "OK because disclosed"; we claim it is **accepted, and equal to what a browser already grants any page.**
- **Class B — the user's *other* data**: other spaces, secrets, other sheets. **The one property that must hold.**

**Load-bearing consequence.** The unclosable channel — a realm's own return value / rendered output — is safe only if **only Class A can reach it.** Ingesting a user's other file makes it Class A **by the deliberate act of routing it in** (via the connector); the invariant protects only what was *not* routed in.

**The reach-bound's real strength is the *aggregate* granularity of the connector's grants — which is unbuilt (RB-6/RB-9).** The Class-A/Class-B split is definitional (anything read becomes Class A), and per-source narrow grants (§4.2) bound each grant but **not the accumulated total**: a fork can request many plausible narrow feeds across a session, each a small delta a fatigued user approves (the TS-19 fatigue that delta-consent §6.2 *reintroduces*), until "everything" is disclosed Class A. So the reach-bound is only as strong as an **aggregate reach view** — "you have routed N sources into this dashboard" — plus a volume signal on accumulated deltas. **That aggregate view is unbuilt** (§6.3); until it exists, the reach-bound rests on per-source consent legibility that is unvalidated.

### 3.2 The no-both invariant — an app-structural discipline, NOT host-enforced against a fork  *(proposal; corrected per RB-1)*

The architecture is *built* so no realm combines two dangerous properties:

| Realm | executes content | Class-B caps | injectable agent |
|---|:--:|:--:|:--:|
| Formula engine | ✅ | — | — |
| Data connector | — | ✅ | — |
| Report view | — | — | — (Class-A only, no eval) |
| Assistant | — | — | ✅ (Class-A only) |

**This is a design discipline, not a host-enforced guarantee (RB-1).** The author draft claimed host-observable **"executor detection"** enforces it; **that claim is struck** — `TRUST_MODES §5:152` deletes the interpreter/executor content-flow gate as *"a declared, inspectable design choice, **not** a capability gate … unprovable against side-eval."* The host **cannot** reliably detect that a realm executes content-as-code. Concretely, a malicious fork needs no `eval` (blocked by CSP, `HOST_ORIGIN_HARDENING §2.1`): it can hand-roll a **metacircular interpreter inside the *connector*** — which legitimately holds Class-B caps — walking M3 feed bytes as a mini-language, **indistinguishable from ordinary data processing**, so that realm holds *two* dangerous properties with nothing to detect.

**What the host actually enforces, honestly:**

1. **Per-realm Class-A-only grants — BUILT (the capability model).** The evaluator, report view, and assistant are granted only *this sheet + this sheet's feeds*; they hold no Class-B read (`core_concepts §5`, per-`appKey` grants). A fork that wants them to hold Class-B must obtain the user's **consent**, visible in the powerbox (§6.2) — never silent. So the invariant holds by construction for honest apps and is **surfaced, not silently violable**, for forks.
2. **Egress-fixing on any Class-B-cap holder — UNBUILT (§12 Q3).** The connector's fetch targets are host-fixed, so even a metacircular-interpreter connector can exfiltrate only to those hosts — with the **TS-4 residual** (data can still leave via the request *body* to a legitimate host; booked, §12). Secrets are host-injected, use-not-read, so no realm reads their value.
3. **Output tiering — UNBUILT (§4).** Each realm's output channel is host-tiered to the floor of its inputs, so a realm that launders internally still emits correctly-tainted output.

**Honest claim:** the four-realm structure is an **app discipline**; a malicious fork can weaken it, but — *once the two unbuilt backstops ship* — cannot (a) silently acquire Class-B reach without consent, (b) exfiltrate beyond the fixed egress hosts (modulo the TS-4 body residual), or (c) launder taint. Executor detection does **no** load-bearing work. Until egress-fixing (Q3) and output tiering (§4) exist, the invariant's enforcement against a hostile fork is **incomplete**, and the spec says so.

> **The evaluator is *starved* by app design** (grant it nothing) because even an M1/M2 formula computes over possibly-M3 data — a confused-deputy risk independent of authorship. This is discipline, not enforcement: a fork can arm its own evaluator, which is why the load-bearing backstops are egress-fixing + output tiering, not the starvation.

### 3.3 Trust-mode integration and the sharing spectrum  *(proposal)*

The two carriers are separate (`TRUST_MODES §2`): the **shared sheet's data** is M3 by construction (multi-writer); the **formulas/app code**, if authored in a **verified org repo behind a review gate**, is **M2**. Intra-org reporting is **M2 code over M3-fenced data**. The four-realm design is the M3-safe design, so it covers the spectrum — **valid only under two conditions (RB-10, prior RA-10)**: (i) the realms whose posture relaxes M3→M1/M2 (report view, assistant) hold no Class-B caps and no network; and (ii) the evaluator's starvation is held constant. These are app-structural conditions (§3.2), not host-enforced.

### 3.4 Non-executable content — the safe renderer  *(proposal; design verified `TRUST_MODES §5.1`, unbuilt)*

The report view renders through the **host/SDK-owned non-executable-MDX safe renderer** (`TRUST_MODES §5.1`): the **no-acorn render-as-data** path captures expressions as **inert strings with no evaluator in the pipeline**. It is the **SDK's TCB, not the app's.** Consequence: a data binding **cannot be `{result("x")}`** — it must be a **declarative attribute** the interpreter resolves (`<Chart source="revenue"/>`); no prop is treated as code or HTML.

### 3.5 The escape hatch — forking adds custom components  *(proposal)*

A component **definition is app source** (fork's code, M1/M2); a **usage is content** (M3, safe-rendered → safe placeholder if unknown). Custom code runs capably only to the degree its author is trusted; a non-member opening a fork gets an M3 app (capability-poor + hardened profile). Catalog audit moves to the fork author. Cost: a report using `<Timeline>` renders only in a fork that has it (degrade gracefully; declare the target fork). **Agent-split:** authoring formulas/tests/MDX is content → the embedded agent (live, §5); custom components are source → the workbench + `contribute` gate.

---

## 4. The ingestion taint-propagation contract  *(proposal — a `TRUST_MODES §5` extension; unbuilt; owns the injection story)*

### 4.1 The problem  *(proposal)*

The connector **interposes** between an external M3 source (a Google Calendar others write invites into, `PERSISTENCE_SPEC`) and the sheet. It is **not an executor** in the tiering sense (it relays bytes as data), so `TRUST_MODES §5`'s executor floor does not tier its output — the booked read-then-egress residual (`§6a` F5 / `AUTHORING_PROVENANCE §6.3`). No byte-level provenance exists (`core_concepts §8`). Getting this wrong **launders** M3 → apparent M1 and worsens injection (`AGENT_AUTHORING §3.2` D4).

### 4.2 The contract  *(proposal)*

> **Every host-mediated inter-realm channel carries a source tier the *host* assigns, equal to the monotone floor of all sources the producing realm has read this instance-session. No realm may declare its own output's tier.**

- Host-owned output channel, **tiered to the floor over the instance's granted inputs**.
- **Per-instance source delegation, not standing per-`appKey` grants (prior RA-3).** Grants key on `(user, appKey, principal)`; two instances of one connector `appKey` would share a grant bundle. So sources are delegated **per launched instance** via an **attenuated `capDir`** (`STANDING_APP_LIFECYCLE §5`), and the host tiers each instance over *its* delegations. Unrelated feeds = separate instances = separate tiers; a cross-tier join floors to the min.
- **Monotone per instance-session**; a mid-session down-tier triggers **flush-then-restart**.
- **Propagates through every hop** — the evaluator's *result* channel is host-tiered to the floor of its formula inputs.

### 4.3 Channel shape — a tiered mount  *(proposal)*

A **host-owned mount** (not a message bus): the tier attaches to what `FILESYSTEM §5` already tiers → minimal delta. `STANDING_APP_LIFECYCLE §4.1` is a **designed precedent (a delegated `capDir` carrying a content-tier floor) but is unbuilt** (`§5.1`/D4, rides AA-01). Consumption is uniform (`fs.promises.*` over `exportZenFS`). **Streaming = materialize-to-mount + `onFsChange`** (human-timescale; a tiered message-bus for high-frequency is deferred, §8).

### 4.4 Laundering resistance — *ingress* only  *(proposal)*

Against a compromised connector on the **read/ingest** path: host-brokering means the host tiers every channel; the app never sets its own tier; per-instance delegation bounds its inputs. **This section covers ingress only.** The distinct **write-laundering** path — a realm writing tiered bytes into a higher-trust *sheet* mount it holds — is **RB-2 / RS-10, an open BLOCKER for the live-persist case**, resolved by the ephemeral-compute rule in §5, **not** by this section.

### 4.5 The dumb-pipe constraint  *(proposal — load-bearing, and the fallback the whole invariant rests on per §3.2)*

The connector holds the TS-5b combo in one app. Safe **only** if it is a **non-agentic, config-driven pipe with host-enforced fixed fetch targets** (§12 Q3, **undesigned**) — fetched content can never decide what else to fetch or where to send. Because §3.2 shows the no-both invariant falls back onto this egress-fixing for a metacircular-connector fork, **Q3 is not a nicety — it is the load-bearing backstop, and it is undesigned.** Feed *definitions* are trusted config; feed *references* are content.

---

## 5. The embedded agent, live compute, and the write model  *(proposal)*

The assistant is an **app-embedded agent** (`agent-demo`/`G12`), not the workbench source-authoring agent, so the `AGENT_AUTHORING` "no stage-composited agent" rejection does not apply. Custom UI.

- **G12 confinement.** Tools = the app's grant-filtered catalog; Class-A-scoped → an injected agent can drive only Class A.
- **Injection bounded, not eliminated** (`TS-1`); feed/evaluator output reaches the agent as **fenced data, never a tool** (`AGENT_AUTHORING §3.2`).
- **Taint fires** on reading M3-tiered feed data **or the shared sheet itself** (M3 when multi-writer).

**Evaluator results are ephemeral — the resolution to RB-2 write-laundering.** The **durable sheet stores formulas + user inputs** (tiered by authorship). **Evaluator results are NOT persisted into the durable sheet** — they live in the host-tiered result channel (§4.2) and **render live**. Rendering an M3-tiered result is safe (the report view is an interpreter — it displays, does not persist). So the **continuous live path never launders** (no M3-derived value enters a higher-trust mount). Two consequences, stated honestly:
- **Explicit "freeze value"** (paste-values of a computed result into a durable cell) is the RS-10 write: it **refloors the target cell/region to the result's tier, or is disallowed.** You **cannot durably cache an M3-feed-derived value in a higher-trust sheet without down-tiering it** — a real constraint on the "live" premise, not hidden.
- The agent authoring **formulas** (not frozen values) is fine — a formula is authored content at the sheet's mode; its M3 inputs produce an M3 *result* that is rendered, not persisted.

**Two write classes, gated differently, and made legible (RB-6/RB-9):**
- **Live Class-A content edits** (formulas/tests/MDX, and rendered results): **un-gated**, bounded by starvation + reach + the safe renderer + the human seeing the result render. `TS-19b` does not apply.
- **Publishing to a shared space, and any source/component edit**: routed through the **gate** with a full non-truncated diff (`TS-19b`).
- **The boundary must be legible *before* it is hit (RB-9):** the agent UI marks, at compose time, which drafted actions are live vs. gate-bound (a persistent "this will publish / edit source → attended diff" affordance), so the diff-gate is never a surprise after twenty silent live edits.

`chat()` is egress (`AGENT_AUTHORING §6`), but the read is narrow (this sheet) → the accepted narrow-read residual, not the TS-5b broad-read gate.

---

## 6. The composite app shape  *(proposal — the net-new platform ask)*

A composite is a **presentation/grouping over per-program grants, never a *merge*** — one app to the user, N isolated principals to the kernel.

### 6.1 The composite manifest  *(proposal; binding-resolved per prior RA-2)*

Members are **binding-resolved, user-overridable *roles*, not pinned app refs** — `STANDING_APP_LIFECYCLE` R-SAL-2 rejects `launch(appRef)`, and `core_concepts §3` forbids self-selected bindings. A member is a **task-contract role** with a **default `ref` the host/user may repoint**; the **trust badge (§6.2) reflects the actually-bound provider** (a repoint re-consents, since grants key on the new provider's `appKey`).

```jsonc
"composite": {
  "name": "Sheets",              // app-chosen chrome — carries NO trust
  "role": "report-view",
  "members": [
    { "role": "formula-engine",  "contract": "ir.evaluate@1", "defaultRef": "…", "capsEnvelope": [] },
    { "role": "data-connector",  "contract": "ir.feed@1",     "defaultRef": "…", "capsEnvelope": ["net:fetch","secrets:use"] },
    { "role": "assistant",       "contract": "ir.assist@1",   "defaultRef": "…", "capsEnvelope": ["llm:chat","worktree:rw@self"] }
  ]
}
```

- **Declaration ≠ authority.** Each member requests its own caps under its own `appKey`, gets its own host-derived trust mode, is binding-conferred its principal. Grouping grants nothing; the host shows the bound member's true badge.
- **Host reconciles declaration against the runtime launch graph** — an undeclared sandbox under the app is flagged.
- **`capsEnvelope` is a legibility signal only, NOT enforcement (prior RA-1 / RB-1).** It powers powerbox attribution and flags an honest author's declaration/grant mismatch; it does not bind a malicious root. The real containment is §3.2's (unbuilt) backstops.
- **Composite identity, not principal** (root `appKey` + manifest hash indexes members/grants; mints no authority).

### 6.2 The composite-aware powerbox  *(proposal)*

- **The connector's TS-5b line (`secrets:use` + `net:fetch`) is taken as an INDIVIDUAL interaction — never bundled (RB-3).** `TS-19` decision #2 forbids bundling the maximally-explicit line; "Approve" may batch only the **Class-A** members. Risk-ordering (scariest first) is *not* a substitute for un-bundling.
- **Host-truth badges** on the *bound* provider (M2 names the specific org; near-miss → M3). The composite **name is chrome, cannot suppress a badge.**
- **The starved realm shown holding nothing** — visible proof of the intended structure (with §3.2's honesty caveat: intended, not fork-proof).
- **Partial approval states dependencies COARSELY — no per-cell "degradation preview" (RB-8).** The host cannot statically predict which charts/cells blank when a member is declined (content-flow opacity, same as §3.2). So partial approval discloses only **statically-known** losses ("declining the connector disables live data; declining the assistant disables AI authoring"); it does **not** promise a preview it cannot compute.
- **Delta consent** for a new feed re-opens only the connector's new cap — *and this reintroduces TS-19 fatigue* (§3.1/RB-6), mitigated only by the aggregate view (§6.3, unbuilt).

### 6.3 Observability, aggregate reach, lifecycle  *(proposal)*

The **composite inspector** shows members, roles, host-truth modes, granted caps, live status, and taint/egress flows; per-member **revoke** (with only the coarse, statically-known consequence, per RB-8). It **must also show the aggregate Class-A frontier (RB-6): the full set of sources routed into this dashboard**, plus a volume signal when a session accumulates many narrow feed deltas — the reach-bound is only as strong as this view. Composite **lifecycle** (launch/keep-warm/teardown) rides launch-to-run (`STANDING_APP_LIFECYCLE`, Open Q#10, **V2**). Attribution of every `forbidden`/error/"report this app" to the right member.

### 6.4 Mobile and run-mode-first — value 8 / value 2  *(proposal — was entirely absent, RB-4/RB-5)*

The net-new consent/observability surfaces are the worst fit for a phone and **must not ship mute on value 8** (sibling specs honor it, e.g. `STANDING_APP_LIFECYCLE §6.1`):
- **Powerbox on mobile:** progressive disclosure, **one member per card**, the scary connector line reachable **without scrolling past benign members**; the individual connector consent (§6.2) is its own full-screen step.
- **Inspector on mobile:** a stacked per-member list, not a wide matrix; the aggregate reach frontier (§6.3) as a summarized count that expands.
- **Run-mode (value 2) on any device:** a **static/in-sheet-only dashboard opens with no powerbox at all** (§1); the composite consent appears only on live-feed activation. Opening a shared read-only dashboard is a first-class, low-friction, mobile-complete path.

*(This section is a booked requirement with an open owner, not a finished design — but the omission is closed.)*

---

## 7. Capability & consent summary  *(proposal)*

| Realm | Standing caps | Consent | Notes |
|---|---|---|---|
| Report view | `rw@self`, narrow feed-read | first-use (Class-A), batchable | Class-A only; renders, does not persist evaluator results (§5) |
| Formula engine | **none** | none | starved by app design; not fork-enforced (§3.2) |
| Data connector | `secrets:use`, `net:fetch` (host-fixed, Q3 unbuilt), per-instance-delegated narrow reads (no broad `mounts:read`) | first-use elevated — **individual, never bundled (RB-3)** | dumb pipe; one instance per tier-class |
| Assistant | `llm:chat`, `rw@self` | first-use (`chat`-egress warning) | Class-A only; injection bounded (§5) |

---

## 8. V1 / V2 dependency ladder  *(proposal — honest split)*

**Buildable now:** four-realm separation via separate repos (isolation today); starved evaluator + interpreter report view; embedded `G12` agent; lookup/poll ingestion via a for-result task; the run-mode-first static-dashboard path (§1/§6.4).

**Platform deltas the SAFETY rests on (unbuilt/undesigned — the honest core of this spec):**
1. **Ingestion taint extension + per-instance `capDir` delegation** (§4) — *`TRUST_MODES §5`/D4 + `STANDING_APP_LIFECYCLE §5.1`, unbuilt.* **The injection story rests on this.**
2. **Host-enforced connector egress-fixing** (§4.5, §12 Q3) — **UNDESIGNED**, and §3.2 shows the no-both invariant falls back onto it against a metacircular-connector fork. **The single most load-bearing gap.**
3. **The non-executable-MDX safe renderer** (§3.4) — *`TRUST_MODES §5.1`, designed + verified, unbuilt.*
4. **A hardened sandbox profile** (§3.2/§8) — a delta on `G1a` (which keeps baseline for M0–M2); `net:fetch` survives `connect-src 'none'` via the host proxy (`UI_AS_APPS §8.11`). *Needs per-frame-CSP infra.*
5. **Launch-to-run / standing-app lifecycle** incl. per-instance delegated launch — *`STANDING_APP_LIFECYCLE`, Open Q#10, **V2, design-pending.***
6. **NET-NEW composite** — binding-resolved manifest + composite-aware powerbox (un-bundled, mobile-aware) + observability incl. the **aggregate reach view** (§6.3). No existing analog.

**Deferred until forced:** a tiered message-bus for high-frequency streaming (§4.3); sibling-entry-point members (AA-01).

---

## 9. Decisions & rejected alternatives  *(proposal — don't relitigate)*

- **Confidentiality as reach, not egress.** *Rejected:* sealing egress; DLP.
- **Four realms; the no-both invariant is an *app discipline*, contained (not enforced) by egress-fixing + output-tiering (both unbuilt) + per-realm grant consent (built) — NOT by executor detection (RB-1).** *Rejected:* claiming host-observable executor detection enforces it (deleted as unprovable, `TRUST_MODES §5:152`); claiming `capsEnvelope` enforces it (root-declared, a fork lies).
- **Evaluator starved by app design; the host backstops are egress-fixing + output-tiering.** *Rejected:* asserting starvation is fork-proof.
- **Evaluator results are ephemeral (rendered, not persisted); explicit freeze refloors or is disallowed (RB-2).** *Rejected:* persisting M3-derived values into a higher-trust sheet (launders); a blanket "never write tiered bytes" rule (incompatible with the live premise).
- **Enforcement-by-grammar (non-executable MDX).** *Rejected:* CSP-alone; arbitrary components.
- **Ingestion tier host-assigned per instance via `capDir` delegation.** *Rejected:* self-declared tier; whole-composite floor; standing per-`appKey` source grants; a message bus (deferred).
- **Connector = dumb pipe with host-enforced fixed targets (Q3).** *Rejected:* an agentic connector.
- **Embedded `G12` agent; live content un-gated, publish/source gated, boundary made legible pre-hoc (RB-6/RB-9).** *Rejected:* stage-composited source agent; claiming `TS-19b` gates the live path; a silent live/gate boundary.
- **Composite members are binding-resolved user-overridable roles (RA-2); `capsEnvelope` is legibility, not enforcement (RB-1).** *Rejected:* pinned `launch(appRef)`; a composite principal / merged grants; a name that launders a badge.
- **The connector's TS-5b line is individually consented, never bundled (RB-3); no per-cell degradation preview (RB-8); run-mode-first + mobile are first-class (RB-4/RB-5).** *Rejected:* an "Approve all" that bundles the scary line; a degradation preview the host cannot compute; shipping the composite mute on values 2 and 8.
- **"Disclosed" is best-effort defense-in-depth with no efficacy claim; the Class-A residual is accepted unconditionally at browser-parity (RB-7).** *Rejected:* treating disclosure as a mitigation the safety argument leans on.

---

## 10. Adversarial review  *(proposal)*

### 10a. Author self-review — superseded by the two fresh-agent passes below.

### 10b. Fresh-agent pass 1 (RA-1…RA-12) — folded.
Found two BLOCKERs (RA-1 root-declared `capsEnvelope` can't enforce; RA-2 pinned member refs are the rejected `launch(appRef)`) + five MAJORs (per-instance keying, cross-mount write-laundering, `G1a` trigger, live-vs-gated gate, anchor honesty). All folded in the first revision.

### 10c. Fresh-agent pass 2 (RB-1…RB-10) — folded into THIS revision.
Re-attacked the pass-1 folds and challenged security + UX + claim-honesty hard. Results:

- **RB-1 [BLOCKER] — RA-1 was RELABELED, not fixed.** "Executor detection" is the content-flow gate `TRUST_MODES §5:152` deletes as unprovable; a metacircular interpreter in the *connector* violates no-both undetectably. → §3.2 rewritten: the invariant is an **app discipline**, contained (not enforced) by egress-fixing (Q3, undesigned) + output tiering (§4, unbuilt) + per-realm grant consent (built); the executor-detection claim is struck. §0/status re-hedged (RB-10).
- **RB-2 [BLOCKER] — RS-10 write-laundering contradicts the live premise.** → §5 **ephemeral-compute** rule: evaluator results render, never persist; explicit freeze refloors-or-disallowed. RS-10 escalated (§11/§12).
- **RB-3 [MAJOR] — "Approve all" bundles the TS-5b line** (TS-19 #2). → §6.2 individual connector consent.
- **RB-4 [MAJOR] — mobile (value 8) absent.** → §6.4 added.
- **RB-5 [MAJOR] — run-mode-first (value 2) compromised.** → §1/§6.4 static-dashboard-no-powerbox path.
- **RB-6 [MAJOR] — reach-bound rests on unbuilt aggregate legibility.** → §3.1/§6.3 aggregate reach view + volume signal, stated unbuilt.
- **RB-7 [MAJOR] — "disclosed" over-claims.** → §3.1/§9 downgraded to best-effort, no-efficacy; residual accepted unconditionally.
- **RB-8 [MAJOR] — "degradation preview" is uncomputable.** → §6.2 coarse, statically-known losses only.
- **RB-9 [MAJOR] — live/gate boundary illegible.** → §5 pre-hoc affordance.
- **RB-10 [MAJOR, honesty headline] — "feasibility-resolved" outran the evidence.** → §0/status now: **shape feasible; safety contingent on unbuilt deltas, not resolved.**

**Remaining exit step:** a third fresh-agent pass on THIS revision — especially on §3.2's honesty (does the "app-discipline + unbuilt-backstops" framing finally state the truth, or still overclaim?), the §5 ephemeral-compute resolution, and whether the safety verdict is now proportionate.

---

## 11. Threat-ID registry  *(proposal)*

| ID | Threat | Status |
|---|---|---|
| **RS-1** | Malicious/shared formula (or metacircular-interpreter connector) exfiltrates | Contained by egress-fixing (Q3, **unbuilt**) + output tiering (**unbuilt**); Class-A residual accepted (§3.1) |
| **RS-2** | A content-executing/agent realm reads Class B | Per-realm Class-A-only grants + consent visibility (**built**); §3.2 |
| **RS-3** | Injected agent wields dangerous caps | `G12` Class-A catalog; Class-B caps live in the connector (§5) |
| **RS-4** | Feed/shared-sheet steers the agent | Fenced data; taint → attended (`TS-1`/`TS-3`); publish/source diff (`TS-19b`) — **taint rests on §4 (unbuilt)** |
| **RS-5** | Ingestion launders M3 → M1 (ingress) | Per-instance mount tier floor (§4) — **unbuilt** |
| **RS-6** | Connector steered to exfiltrate | Dumb pipe + host-fixed targets (§4.5, Q3 **undesigned**) — the load-bearing gap |
| **RS-7** | Content executes in the report view | Non-executable safe renderer (§3.4, **unbuilt**) |
| **RS-8** | Composite name launders a member's trust | Host-truth badges on the bound provider (§6.1/§6.2) |
| **RS-9** | Undeclared sandbox under the app | Manifest ↔ launch-graph reconciliation (§6.1) |
| **RS-10** | **Live write-laundering: an M3-derived value persisted into a higher-trust sheet** | **Resolved for the live path by ephemeral compute (§5); the explicit-freeze case refloors-or-disallows** — booked, dependency `AUTHORING_PROVENANCE`/R3-156 |
| **RS-11** | Aggregate reach reconstructed via many narrow feed deltas (consent fatigue) | Aggregate reach view + volume signal (§3.1/§6.3) — **unbuilt** |

---

## 12. Booked residuals & open questions  *(proposal)*

**Booked residuals:** Class-A self-exfil (return value / self-nav one-secret, browser-parity, accepted **unconditionally**, disclosure best-effort); TS-4 body-exfil to an egress-fixed legitimate host; shared-sheet content reaching the LLM provider via the assistant; narrow-confidential-read (no DLP); over-tainting from per-instance flooring; explicit-freeze down-tiering of a personal sheet (§5).

**Open questions (the honest gaps):**
- **Q1** — spin the composite into `COMPOSITE_APP_SPEC`.
- **Q2** — *(RB-1)* there is no host-observable executor-detection signal; is the "egress-fixing + output-tiering" backstop pair *sufficient* to call the app safe, or is a further mechanism needed for a metacircular-connector fork?
- **Q3 — the host-enforced form of the connector's fixed fetch targets. UNDESIGNED and load-bearing (§3.2/§4.5).**
- **Q4** — the elevated slot/principal for the connector; open vs first-party-restricted.
- **Q5** — high-frequency streaming (tiered message bus).
- **Q6** — *(RB-2)* the explicit-freeze refloor semantics + UX; does down-tiering a personal sheet on freeze surprise users?
- **Q7** — *(RB-4/RB-5/RB-6)* owners for the mobile composite surfaces and the aggregate reach view.

---

## 13. Load-bearing assumptions & code anchors  *(required)*

### Depends-on-today (grep-verified)

| Assumption | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| App code runs in opaque-origin sandboxed iframes without `allow-same-origin` | `immediately-run-sandpack/sandpack-client/src/clients/iframe-factory.ts` | `allow-scripts` |
| Host CSP enforces `script-src 'self'`, no `unsafe-eval` | `immediately-run-site-main/src/security/csp.ts` | `script-src` |
| An app embeds an agent whose tools are the grant-filtered catalog (`G12`) | `agent-demo/src` | `useCatalog` |
| A mount is exported to a consumer over a `MessagePort`, scoped + mode-clamped | `immediately-run-site-main/src/editor/task/mintDelegations.ts` | `exportZenFS` |
| Source tier is computed live from membership, never a stale stored bit | `docs/specs/FILESYSTEM_SPEC.md` | `never a stale stored bit` |
| `net:fetch` is host-proxied over the parent origin (survives iframe `connect-src 'none'`) | `docs/specs/UI_AS_APPS_SPEC.md` | `net-fetch` |
| The interpreter/executor split is not a host-enforceable capability gate (bounds §3.2's honesty) | `docs/specs/TRUST_MODES_SPEC.md` | `not* a capability gate` |

### Must-establish (new invariants the implementation must create)

| New invariant | Proven by (gate test) |
|---|---|
| Connector-output & evaluator-result mounts carry a host-assigned tier = floor of per-instance-delegated inputs (§4) | ingestion-taint gate: M3-bound output arrives tagged M3; two instances of one connector `appKey` share no source grant |
| **Host-enforced connector egress-fixing (Q3): a connector cannot fetch a non-fixed host even under a metacircular interpreter (§3.2/§4.5)** | egress-fixing gate — **the load-bearing, undesigned backstop** |
| The safe renderer runs no author JS (§3.4) | `f={fetch("/x")}` captured as an inert string; no evaluator in the pipeline |
| Evaluator results are never silently persisted into a higher-trust sheet; explicit freeze refloors or is refused (§5/RS-10) | write-laundering gate (dependency R3-156) |
| The composite name cannot alter a bound member's host-truth badge; the connector's TS-5b line is a stand-alone consent (§6.1/§6.2) | powerbox tests (badge integrity; un-bundled elevated line) |
| A static/in-sheet-only dashboard launches with no elevated powerbox on any device (§1/§6.4) | run-mode-first gate (desktop + mobile) |
