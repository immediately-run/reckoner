# Reckoner — Product Definition

**Status:** draft · **Updated:** 2026-07-09

> Reckoner is the product name for the design explored in the immediately.run platform spec
> [REPORTING_SPREADSHEET_SPEC.md](REPORTING_SPREADSHEET_SPEC.md) (a copy of
> `docs/specs/REPORTING_SPREADSHEET_SPEC.md` from the immediately.run docs repo, which remains
> canonical). This document describes *what Reckoner is* for
> users; the platform spec owns the security architecture, and
> [problem_statement.md](problem_statement.md) / [research_proposal.md](research_proposal.md)
> own what remains unsolved.

## One-paragraph summary

Reckoner is a dashboard, reporting, and data-analysis application that treats report logic as
**software** rather than as spreadsheet folklore. A Reckoner document pairs two artifacts: a
**workbook** of worksheets — spreadsheet/notebook-like collections of named cells whose
formulas are ordinary JavaScript/TypeScript, each covered by unit tests — and one or more
**report templates**, written in a non-executable subset of MDX, that lay out charts, tables,
KPIs, and prose bound to those cells. Data can be **static** (entered in the sheet), **pulled**
(looked up from an external source on demand), or **live** (streamed, with the report updating
in real time), and viewers can **drill into** interactive reports without ever touching a
formula. Because formulas are real code, they are authored primarily by coding agents, tested
like code, versioned like code, and reviewed like code — while the report a viewer opens stays
as safe and as instant as opening a web page.

## Why it exists

Two observations motivate Reckoner:

1. **Spreadsheets carry an organization's most vital reporting information but give poor means
   to build rich, live, interactive dashboards.** The grid is a great input surface and a poor
   presentation surface; "the dashboard" usually means exporting to a separate BI tool that
   forks the logic.
2. **A spreadsheet is a programming language with none of the tooling.** Formulas have no
   tests, no types, no review, no version history at the logic level, and no meaningful way
   for a coding agent to help. If formulas were JavaScript, report logic would be a
   unit-testable, agent-authorable, diff-reviewable software artifact.

Reckoner is the bet that both problems have the same fix: separate the **logic** (a tested
workbook) from the **presentation** (a declarative template), make both plain files in a
repository, and let the platform's sandboxing make it safe to share the result with people who
have no reason to trust the author.

## Core concepts

### Workbook, worksheet, cell

A **workbook** is the logic layer of a Reckoner document. It contains **worksheets** — ordered,
notebook-like collections of **cells**. A cell has:

- a **name** (cells are referenced by name, not by grid coordinates — `revenue.q3`, not `B7`);
- a **formula**: a JavaScript/TypeScript function of its inputs. Inputs are other cells, static
  values, or data feeds. Formulas are pure with respect to their declared inputs — same inputs,
  same output;
- **tests**: unit tests that live beside the formula and run in the same evaluation
  environment the formula runs in. A cell without tests is visibly untested, the way uncovered
  code is visibly uncovered;
- a **value**: the current result of evaluating the formula over the current inputs. Values are
  computed, displayed, and recomputed when inputs change; they are not silently persisted back
  into the document (see "Live data and freezing" below).

Worksheets are files. A workbook is a directory of files. Everything an agent or a human needs
to understand, test, and change the logic is on disk in a git repository — no opaque binary
document format.

### Report template

A **report template** is the presentation layer: a document written in a **non-executable
subset of MDX** that arranges prose, charts, tables, KPI tiles, and layout primitives, and
binds them to workbook cells **declaratively** — `<Chart source="revenue.by_month" />`, never
`{code()}`. The template language deliberately cannot express computation:

- no expression evaluation, no event handlers, no arbitrary components — a fixed, audited
  component catalog with typed attributes;
- data bindings are attribute references to named cells or feeds, resolved by the renderer;
- unknown components render as a safe placeholder rather than executing anything.

This restriction is what makes reports shareable: opening someone else's dashboard renders
their template through a safe renderer without running a single line of their code in the
viewer's context. Computation lives in the workbook, where it is sandboxed, starved of
capabilities, and tested. (The renderer design is the platform's non-executable-MDX safe
renderer; see the platform spec §3.4.)

Interactivity — filtering, drill-down, parameter widgets — is expressed as declarative
template affordances whose state feeds back into designated **input cells**, so "the viewer
picked region = EMEA" is just another input the workbook recomputes over.

### Data: static, pulled, live

Every value in a report is ultimately one of three kinds:

| Kind | Where it lives | Freshness | Example |
|---|---|---|---|
| **Static** | in the worksheet itself | changes only when edited | budget assumptions, targets, manual entries |
| **Pulled** | an external source, fetched on demand | as of last lookup | a currency rate, a database query result |
| **Live** | an external stream | continuously updated | ops metrics, order flow, sensor data |

Pulled and live data enter through **data connectors** — deliberately "dumb" ingestion
components that fetch from configured sources and materialize results where formulas can read
them. Connectors are the only part of a Reckoner document that touches the network or
credentials, and they are configuration-driven: fetched content never decides what else to
fetch or where to send anything.

### Reports are run-mode-first

Consuming a report is the primary experience, and it is never taxed to improve authoring
(platform value 2). Concretely:

- A dashboard containing **only static data opens instantly with no permission prompts at
  all** — the viewer just sees the report.
- Consent UI appears only when the viewer **activates a live feed** or another elevated
  feature, and it is scoped to exactly that.
- Reports are first-class on **mobile** (platform value 8): templates degrade to a
  single-column reading experience, and drill-down works with touch.

### The assistant

Reckoner embeds a **coding-agent assistant** that authors and modifies formulas, tests, and
templates on the user's behalf. The assistant is a first-class author (platform value 5): the
expected workflow for most users is conversational — "add a cell that computes churn by
cohort, test it against last quarter's numbers, and put a trend chart in the weekly report" —
with the agent writing the code, running the tests, and showing the result live. The
assistant's reach is bounded to the current document's content; publishing to a shared space
or editing app source always passes through an attended, full-diff approval gate.

## Who it is for

- **Report viewers** — the primary audience. They open a link, see a live report, drill into
  it, and never see a formula. Viewing must be as safe as visiting a web page: Reckoner runs
  on immediately.run, so the worst a malicious report can do is bounded by the platform's
  sandbox and by whatever the viewer explicitly consented to (nothing, for a static report).
- **Report authors / analysts** — the people accountable for the numbers. They work through
  the assistant or directly in the workbook, and get software-grade tooling: tests, types,
  version history, review.
- **Coding agents** — at least as important as human authors. The formula API, the test
  harness, the template component catalog, and the document layout are all designed to be
  driven from their self-descriptions, with no tribal knowledge.
- **Organizations** — teams that fork Reckoner (or just its component catalog) to encode
  house data-visualization style and domain components, then publish internal dashboards over
  shared, access-controlled data.

## What you can do with it

- **Build a live dashboard** whose logic is tested JavaScript and whose layout is a readable
  MDX document — both plain files in a git repository, cache-accelerated and instantly
  runnable on immediately.run.
- **Share it** with anyone. Static reports open with zero friction; live reports ask the
  viewer for exactly the feed access they activate.
- **Drill in**: filter, expand, and re-parameterize interactive reports; the workbook
  recomputes and the template re-renders live.
- **Stream data through it**: connect a live source once, and every chart bound to it stays
  current.
- **Delegate the authoring to an agent**, with correctness anchored in the unit tests the
  agent writes and runs alongside every formula.
- **Fork and extend**: add custom template components in a fork (component *definitions* are
  app source; component *usages* are content) — a report using `<Timeline>` renders fully in
  a fork that ships it and degrades gracefully elsewhere.

## Deployment shapes

Reckoner inherits the platform's separation between **app code** and **content**, giving a
continuum of deployment shapes (platform spec §1):

| Shape | App code | Content (workbook + templates) | Character |
|---|---|---|---|
| **Stock Reckoner + your content** | the canonical app, unmodified | your repo or space | portable, cross-org, public-safe |
| **Org fork + external content** | your org's fork (custom components, house style) | shared org space | org-customized |
| **Fused** | fork with content embedded in the app repo | content *is* app source | purpose-built single dashboard |

## How it runs (the shape, briefly)

Reckoner is not one program but a small **composite** of isolated, sandboxed parts, each
holding only what its job requires (platform spec §2):

- the **report view** renders templates and results — it executes no content code;
- the **formula engine** executes formulas and tests — it holds **no capabilities at all**
  (no network, no filesystem beyond its inputs, no secrets);
- the **data connector(s)** fetch external data — they hold credentials and network access but
  execute no content and host no agent;
- the **assistant** authors content — its tools are confined to this document.

Why it is shaped this way — and what remains genuinely unsolved about making that shape safe
and pleasant — is the subject of [problem_statement.md](problem_statement.md).

## What Reckoner is not

- **Not a spreadsheet grid clone.** There is no infinite grid of `A1` coordinates; cells are
  named, formulas are functions, and layout belongs to templates. Importing tabular data is
  in scope; emulating Excel is not.
- **Not a hosted BI service.** All evaluation and rendering happen client-side in the
  viewer's browser, in immediately.run sandboxes. There is no Reckoner server executing
  formulas or warehousing data.
- **Not a general notebook.** Cells are pure formulas over declared inputs, not arbitrary
  stateful scripts with side effects. That restriction is what makes recalculation, testing,
  and safe sharing tractable.
- **Not a template engine that trusts its input.** Templates cannot compute; a report you
  did not write cannot run code in your session by being rendered.
- **Not a replacement for the platform.** Sandboxing, consent, identity, sharing, and
  contribution flows are immediately.run's; Reckoner composes them (platform value 7).

## Related documents

- [problem_statement.md](problem_statement.md) — the three hard problems Reckoner must solve.
- [research_proposal.md](research_proposal.md) — the open research questions and how we
  propose to attack them.
- [REPORTING_SPREADSHEET_SPEC.md](REPORTING_SPREADSHEET_SPEC.md) — the platform-level
  security architecture: the four-realm composite, the reach-not-egress confidentiality
  model, taint propagation, and the honest list of unbuilt platform prerequisites.
  (Local copy; the canonical version lives in the immediately.run docs repo at
  `docs/specs/REPORTING_SPREADSHEET_SPEC.md`.)
