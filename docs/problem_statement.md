# Reckoner — Problem Statement

**Status:** draft · **Updated:** 2026-07-09

> Companion to [product_definition.md](product_definition.md). This document states the three
> problems Reckoner must solve to exist — honestly, including the parts that are currently
> unsolved. The concrete open questions derived from these problems are enumerated in
> [research_proposal.md](research_proposal.md); the platform-level security design lives in
> [REPORTING_SPREADSHEET_SPEC.md](REPORTING_SPREADSHEET_SPEC.md) (local copy; canonical in
> the immediately.run docs repo as `docs/specs/REPORTING_SPREADSHEET_SPEC.md`).

Reckoner's premise — *formulas are JavaScript; dashboards are shareable* — is attractive
precisely because it is dangerous. "Formulas are JavaScript" means a shared document carries
arbitrary code written by someone the viewer has no reason to trust. "Authored by agents"
means most of that code will be machine-written, so correctness cannot rest on the author's
care. "Visually appealing reports, generated" means an LLM makes design decisions that
today's LLMs are reliably mediocre at. Each of these is a real problem, not an integration
task. This document states each one, why it is hard, and what any acceptable solution must
satisfy.

---

## Problem 1 — Security: isolating cell evaluation from template rendering and data reading

### The problem

A Reckoner document combines three activities with fundamentally different risk profiles:

1. **Evaluating workbook cells** — executing content-authored JavaScript. Whoever wrote the
   sheet (a colleague, a stranger whose dashboard you opened, an agent steered by malicious
   feed data) is running code.
2. **Rendering report templates** — turning content-authored markup into the pixels a viewer
   sees. Rendering happens in *every* viewing session, including the zero-consent
   static-report path, so it must be safe against arbitrary hostile templates by
   construction.
3. **Reading data sources** — holding the document's *only* dangerous authority: credentials
   (`secrets:use`) and network access (`net:fetch`) to external systems.

Put any two of these in the same execution context and the combination is lethal:

- evaluation + data reading → a malicious formula uses the connector's credentials and
  network to read and exfiltrate anything the connector can reach;
- evaluation + rendering → a hostile shared sheet runs code in the viewer's session the
  moment the report opens, defeating the "viewing is safe" promise;
- an agent + either → prompt injection in feed data or sheet content steers an agent that
  wields real authority (the platform's TS-5b read-exfiltration threat).

So the core security problem is **decomposition**: split the product into isolated realms
such that **no realm holds two of {executes content as code, holds dangerous capabilities,
hosts an injectable agent}** — and then be honest about how much of that split is actually
*enforced* versus merely *intended*.

### The architecture, and the honest caveat

The platform spec resolves the *shape*: four sandboxed realms with distinct identities —
a **report view** (renders, never executes; Class-A grants only), a **formula engine**
(executes, holds *nothing* — deliberately starved), **data connectors** (credentials and
network, but a non-agentic "dumb pipe" whose fetch targets are fixed configuration), and an
**assistant** (an agent confined to this document's content) — plus a host-owned
**non-executable-MDX safe renderer** so templates are data, never code.

Confidentiality is defended as **reach, not egress**: on the open web, egress can never be
fully sealed (rendering alone can leak bits), so the load-bearing property is that the
realms that execute content or host the agent can only *reach* the document's own content
("Class A"), never the user's *other* data ("Class B" — other spaces, secrets, other
sheets). Leaking what a document legitimately contains is accepted at browser parity;
leaking anything else must be impossible.

The honest caveat, recorded after two adversarial review passes: **parts of this are design
discipline, not host-enforced guarantees.** The host cannot detect that a realm "executes
content" (a malicious fork can hand-roll an interpreter inside the connector,
indistinguishable from data processing). What the host *does* enforce is per-realm grants
(built: the starved engine simply holds nothing, and a fork wanting more must obtain visible
user consent) — backstopped by two mechanisms that are **not yet built**: host-enforced
connector egress-fixing (a connector cannot fetch beyond its configured hosts, no matter how
compromised) and host-assigned output tiering (every inter-realm channel carries a
trust-tier floor computed by the host, so ingested low-trust data can never be laundered
into apparent high-trust data). Until those land, the four-realm split protects honest
documents and *surfaces* — but does not fully contain — hostile forks.

### What a solution must satisfy

- **Viewing is safe by construction.** Opening a static report executes zero
  content-authored code and raises zero consent prompts, on any device.
- **The formula engine stays starved.** Formulas compute over exactly their declared inputs
  and can reach nothing else — no network, no filesystem beyond inputs, no secrets, no
  platform API. Every capability the engine lacks is a capability injection cannot abuse.
- **Connectors are dumb pipes.** Configuration decides what is fetched from where; fetched
  content never influences subsequent fetches or destinations. Adding a feed is an explicit,
  individually-consented act — never bundled into a blanket "approve all".
- **Taint is tracked, not laundered.** Data from a low-trust source (a shared space, an
  external feed others can write into) keeps its tier through every hop — connector output,
  formula results, rendered report — with the tier assigned by the host, never
  self-declared. Computed results derived from low-trust inputs render live but are not
  silently persisted into higher-trust documents.
- **The user can see the blast radius.** At any moment: which realms exist, what each holds,
  which sources have been routed into this document (the *aggregate* reach, not just the
  last delta), and one gesture to revoke any of it.
- **Failure modes are named.** Residuals that cannot be closed (Class-A self-exfiltration at
  browser parity; request-body exfiltration to a legitimate configured host) are stated, not
  hidden behind "sandboxed" hand-waving.

### What failure looks like

A dashboard forwarded around an org that quietly reads the viewer's other spaces; a "helpful"
shared sheet whose formulas walk the connector into exfiltrating a database; an assistant
steered by a poisoned feed row into publishing confidential cells; a viewer trained by
consent fatigue to click "approve" on feed number nineteen. Any of these once, publicly, and
the "safe to open a stranger's dashboard" premise is dead.

---

## Problem 2 — Authoring UX: JavaScript formulas, written mostly by agents, correct by testing

### The problem

Replacing `=SUMIFS(B:B, A:A, ">2024")` with JavaScript trades a limited-but-forgiving
language for a powerful-but-unforgiving one. Spreadsheet formulas are written by pointing at
cells, evaluated instantly, and wrong in visible ways. JavaScript formulas are written as
code, evaluated in a sandbox the author cannot see into, and wrong in *invisible* ways — an
off-by-one in a cohort filter produces a plausible chart, not an error. And Reckoner's
primary formula author is a **coding agent**, which changes the problem twice over:

- the *ergonomics* question shifts from "can a human discover this API?" to "can a model
  drive this API correctly from its self-description, without hallucinating methods or
  mis-serializing arguments?" (the platform already has scar tissue here: a tool that is
  listed but lacks a parameter schema is a tool the model mis-calls);
- the *correctness* question shifts from "did the author check the number?" to "what
  machine-checkable evidence exists that this formula is right?" — because neither the agent
  nor the human reviewing twenty agent-written cells will hand-verify each one.

Reckoner's answer is to make **unit tests the definition of formula correctness**: every
formula ships with tests; tests run in the same starved evaluation environment as the
formula; untested cells are visibly untested; and the authoring loop (human or agent) is
*write formula → write tests → run tests → see the report update*. The problem is making
that loop fast, honest, and pleasant inside a security architecture that deliberately makes
the evaluation environment opaque.

### Why it is hard

- **The API must be small enough to hold, rich enough to matter.** A formula needs its
  inputs (other cells, feed frames, viewer parameters), a data-shaping vocabulary
  (group/join/window/aggregate), and nothing else. Every additional API surface is both
  cognitive load and attack surface; every missing affordance sends authors back to
  hand-rolled reduce-loops that agents get subtly wrong.
- **Dependencies must be knowable.** Recalculation, caching, testing, and taint tracking all
  need to know what a formula reads. Arbitrary JavaScript hides its dependencies; the design
  must make them explicit or reliably discoverable — without making formulas so ceremonial
  that the notebook feel dies.
- **Purity is load-bearing but unenforceable in general.** Same-inputs-same-output is what
  makes tests meaningful, recalculation sound, and results reproducible. JavaScript offers
  no purity guarantee; the environment must *make* impurity unrewarding (no ambient I/O, no
  clock/randomness except as declared inputs, frozen inputs) and testing must catch what
  slips through.
- **The feedback loop crosses a sandbox boundary.** The formula engine is a capability-free
  sandbox by design (Problem 1). Authors and agents still need error messages with usable
  stacks, log/trace output, test results, and intermediate values — all without giving the
  engine an egress channel that defeats its starvation. "Debugging a formula" and "the
  formula cannot phone home" are in direct tension.
- **Tests need fixtures; fixtures need discipline.** Testing a formula over a live feed
  requires captured frames; capturing real data into test fixtures moves possibly-sensitive,
  possibly-low-trust bytes into the document. Fixture capture must respect the same tiering
  as everything else.
- **Failure must degrade gracefully for viewers.** When a formula throws or a test fails,
  the *author* needs a stack trace; the *viewer* needs a clearly-marked broken tile that
  does not take down the report, and never an exposed internals dump.

### What a solution must satisfy

- A formula API an agent can drive **from its published self-description alone**, with typed,
  schema-carrying signatures for every callable surface.
- Dependency declaration that is **checkable** — an undeclared read fails loudly at
  evaluation time rather than silently pinning stale data.
- A **test runner inside the evaluation sandbox** with structured results out; tests are
  first-class cells, run on save and on demand, cheap enough to run on every recalculation
  of the fixtures they cover.
- **Sub-second** edit-to-result feedback for typical worksheets; correctness of
  recalculation order under any dependency graph shape (see the research proposal's
  recalculation questions).
- An agent workflow where "the tests pass" is a real signal: the agent authors tests it
  cannot trivially game (fixture provenance, coverage visibility), and the human review
  surface shows formula + tests + result together.
- Errors that carry **source-mapped locations in the author's files**, both to humans and to
  agents, despite transpilation and sandboxing.

### What failure looks like

Quietly wrong dashboards: formulas that pass vacuous tests, dependencies that silently
staled, an agent that confidently ships plausible-looking aggregations nobody can audit. Or
the inverse failure: an authoring loop so slow and ceremonial (declare, typecheck, sandbox
round-trip, consent) that users go back to Excel and the "logic as software" premise never
gets its fair trial.

---

## Problem 3 — Generated design: LLM-authored report templates that serve the data

### The problem

Most Reckoner reports will be laid out by an LLM — the same assistant that writes the
formulas. The bar is not "produces a chart"; it is **visual communication**: a report whose
design helps a reader grasp what the data says and what matters about it, rather than
distracting from it. Today's LLMs, asked for a dashboard, reliably produce the opposite —
gradient-heavy tile walls, a pie chart for everything, ten accent colors, KPI counters for
noise metrics — decoration standing in for judgment.

The problem is to get **consistently good, message-first report design out of a model**,
under Reckoner's specific constraints:

- the output medium is the **non-executable MDX subset** — a closed catalog of declarative
  components. The model cannot escape into arbitrary HTML/JS to hack a layout; whatever
  design quality is achievable must be achievable inside the catalog;
- the report must work on **mobile and desktop** (platform value 8), in light and dark
  themes, and degrade gracefully when a bound cell errors or a feed is unconsented;
- the design must stay subordinated to the **data's message** — which the model must first
  *identify* (what changed, what is anomalous, what the reader should do) before it can lay
  anything out.

### Why it is hard

- **Good chart choice is judgment, not lookup.** Bar vs. line vs. table vs. "just show the
  number" depends on the question the reader is asking, the data's shape, and what
  comparison matters. Models default to the most decorative valid option; the catalog and
  guidance must bias them to the most *communicative* one.
- **The message must be found before it can be conveyed.** "Visualize this workbook" is
  under-specified: a good report leads with the anomaly or the decision-relevant number, not
  with one tile per cell in file order. That requires the generation pipeline to reason
  about the *data* (trends, outliers, magnitudes), not just the schema.
- **Restraint is the hard part.** The difference between a clear report and chartjunk is
  mostly what is *left out*: fewer colors, fewer chart types, no gratuitous animation, white
  space, one typographic scale. A component catalog can make good defaults easy — encoding
  *restraint* into both the catalog's expressiveness ceiling and the model's choices is the
  open question.
- **Quality is evaluable but not compilable.** There is no type-checker for "this conveys
  the message". Evaluation needs rubrics, judge models, and human calibration — and the
  platform's own working style (adversarial review, judge panels) suggests machinery, but
  what the *rubric* should be, and how well LLM judges track expert judgment on report
  design, is unvalidated.
- **The design system is a constraint and an asset.** Reckoner ships opinionated tokens
  (type scale, spacing, a bounded palette, light/dark). Generated templates must compose
  within them — which conveniently narrows the model's decision space to decisions that
  remain: hierarchy, chart form, density, annotation.

### What a solution must satisfy

- A template component catalog whose **defaults produce a competent report even from a
  mediocre generation** — correct chart/axis/legend behavior, accessible color, responsive
  layout are the catalog's job, not the model's.
- A generation pipeline that separates **message-finding** (analyze the data, decide what
  the report should say) from **layout** (express it in the catalog), so each is
  inspectable and improvable independently.
- A **measurable quality bar**: a rubric for message-clarity/restraint/hierarchy, scored by
  judge models calibrated against human raters, applied to every generated template in
  evaluation — with regressions visible before they ship.
- Templates that pass the bar **on phone-sized viewports and in both themes**, not just on
  the desktop the model imagined.
- A human/agent **iteration loop**: "make the churn section lead", "drop the pie" — small
  edits to a generated template must be easy, because the first generation will rarely be
  the last word.

### What failure looks like

Reports that read as AI-generated at a glance — busy, generic, interchangeable — so authors
export to their old tools for anything that matters. Or a catalog so restrictive in pursuit
of taste that real reports cannot be expressed, and the escape hatch (forked custom
components) becomes the norm, dissolving the safety and coherence the catalog exists to
provide.

---

## How the three problems interact

These are one product, and the couplings are where the design gets hard:

- **Security bounds authoring UX.** The starved evaluator (Problem 1) is exactly why
  debugging and test feedback (Problem 2) need deliberate design — the easy fixes (give the
  engine a console endpoint, let it fetch source maps) are capability leaks.
- **Testing is a security control.** Agent-authored formulas with real tests (Problem 2)
  are also the defense against an agent steered into subtly-wrong logic (Problem 1's
  injection story): machine-checkable correctness evidence is what the attended human
  actually reviews.
- **The template catalog serves both masters.** Non-executability (Problem 1) and
  design-quality-by-default (Problem 3) are the *same* catalog — every component added for
  expressiveness is new attack surface and new ways for a model to make something ugly.
  Catalog design sits at the intersection of all three problems.

The open research questions that fall out of this document are collected and prioritized in
[research_proposal.md](research_proposal.md).
