# immediately.run Reckoner Document Versioning — the format/stdlib/catalog compatibility envelope

**Status:** proposal / draft — **Spine 3** of the up-front-design triage
(`../ARCHITECTURE_PLAN.md` §0.1). Scope is the **envelope + compatibility policy
only**, to be folded into the **M1 format freeze** — *not* migration machinery. Design only,
nothing built. · **Updated:** 2026-07-09

> **The single implementation-status source for this spec is
> `docs/status/DOCUMENT_VERSIONING_STATUS.md`** (to be created at build) — where they disagree,
> the status doc governs.

> **Reads first:** `../ARCHITECTURE_PLAN.md` §3 (document model — the formats this
> versions), §3.2 (additive-only stdlib), §3.3 (the component catalog), §5.4 (freeze/frames),
> §12 (the parked "catalog/stdlib versioning" + "reproducibility" questions this closes);
> `ENGINE_INFORMATION_FLOW_SPEC.md` §4 C5 (frozen frames carry a capture epoch — the
> reproducibility hook). Companion practice: `new-project-template` `package.json`
> `"immediately.run": { "requireLatest" }` (the platform's existing freshness enum — a
> precedent for a document-level compatibility field).

---

## 0. Why this is up-front, not implementation-time  *(normative intent)*

A Reckoner document is **long-lived and shared**: it is opened by viewers, forked, and
re-run months after it was authored, against whatever app version is current then. Four
things underneath it **evolve independently of the document**:

1. the **document format** (the worksheet/template/fixture/`reckoner.json` schema, §3);
2. the **stdlib** (formula callables, §3.2 — additive-only, but additions still change what a
   document may reference);
3. the **component catalog** (template components, §3.3 — additive);
4. the **tier-tag encoding** and other host-interpreted metadata (§5.4).

If the format carries **no version envelope from v1**, the first change to any of these either
breaks every shared/forked document or renders it silently wrong — and retrofitting an envelope
is a migration of *every document in existence*. The envelope is cheap now (a few fields + a
resolution rule) and a rewrite later. That asymmetry is why it is booked for the **M1 freeze**,
before any document is shared.

This spec deliberately specifies **only the envelope and the resolution policy** — enough that
later evolution is *possible* and *legible*. The actual per-version migrations, codemods, and
catalog shims are implementation-time work that the envelope makes tractable.

## 1. The envelope — what a document declares  *(proposal — owned by the M1 freeze)*

`reckoner.json` carries a `compat` block. Every field is a **range the document was authored
against and needs**, not a pin:

```jsonc
// reckoner.json
{
  "format": 1,                       // integer; the document-schema major (breaking → bump)
  "compat": {
    "stdlib":  ">=1.4 <2",           // the formula stdlib the worksheets rely on
    "catalog": ">=1.2 <2",           // the template component catalog the templates rely on
    "tierTag": 1                     // the tier-tag encoding version (host-interpreted)
  },
  "authoredWith": {                  // provenance, not a constraint (reproducibility, §4)
    "app": "reckoner@1.4.2",
    "stdlib": "1.4.0",
    "catalog": "1.2.1"
  }
}
```

- **`format`** is an integer major. A breaking schema change bumps it; the app supports a set of
  format majors and refuses (legibly, §3) a format it does not know.
- **`compat.*`** are semver ranges. A document declares the **minimum** it needs and the major
  it was built for. Because stdlib and catalog are **additive-only** (§3.2/§3.3), the common
  case is "needs ≥ the version that introduced the newest callable/component I use, same major"
  — a lower bound, open upper bound within the major.
- **`authoredWith`** is exact-version **provenance**, never used for resolution — it exists so a
  re-run can be reproduced (§4).

The author does not hand-maintain `compat`: the host **derives** the lower bounds by static
analysis (which stdlib callables the worksheets import, which components the templates use →
the versions that introduced them) at save time, the same way it derives the dependency graph
(§3.1). `authoredWith` is stamped by the running app.

## 2. The resolution rule — how the current app opens an old document  *(normative)*

On open, the app compares its own `{format, stdlib, catalog, tierTag}` versions to the
document's `compat`:

| Case | Result |
|---|---|
| App satisfies every `compat` range and knows the `format` major | **Runs normally.** |
| App's stdlib/catalog is **newer, same major** | **Runs** (additive-only guarantees the document's callables/components still exist). |
| Document needs a **newer** stdlib/catalog than the app has (e.g. an old app opening a new document) | **Legible degradation** (§3): the specific unknown callable/component renders as a marked placeholder naming what it needs; the rest runs. Never a silent wrong render. |
| App does **not** know the `format` major (a breaking schema change it predates) | **Refuse with a legible message** ("this report needs a newer Reckoner"), never a partial parse. |

The **additive-only contract does the heavy lifting** (§3.2 decision): within a major, forward
compatibility is free because nothing is ever removed or changed — only added. The envelope's
job is to make the *cross-major* and *old-app-new-document* cases **legible**, not to prevent
them. A major bump is the escape hatch for the one thing additive-only cannot absorb (a genuine
breaking change); it is expected to be rare and to ship with a codemod (implementation-time).

## 3. Legible degradation, not silent wrong data  *(normative — reuses §3.3)*

The degradation surface is the one the catalog already defines (§3.3): an unknown component
renders as a safe placeholder naming what it needs, and this spec extends the same treatment to
an unknown-stdlib formula (the cell renders as a marked "needs stdlib ≥ x" tile, not a broken
value or a silent zero) and an unknown tier-tag encoding (the value is treated as its
host-authoritative mount tier — §5.4/L1 — and the unreadable in-file tag is ignored, never
trusted). The invariant: **a version mismatch degrades visibly and specifically; it never
produces a plausible-but-wrong number.** This composes with the testing story's standing rule
(a green suite over a mismatched runtime is not a correctness claim).

## 4. Reproducibility falls out of the envelope  *(normative intent — closes a §12 parked question)*

"Which numbers did we report last quarter?" is answerable **iff** the document records the
versions that produced them. The envelope provides two of the three needed pieces, and Spine 1
provides the third:

1. **`authoredWith`** (§1) records the exact app/stdlib/catalog versions — the *code* that
   computed the numbers.
2. A **frozen frame / snapshot** (§5.4, `ENGINE_INFORMATION_FLOW §4` C5) records the *data* and
   its **capture epoch** — the inputs.
3. Re-running (1) over (2) reproduces the numbers, because formulas are pure (§3.1).

So "report reproducibility" is not a separate feature: it is **`authoredWith` + a freeze at
report time**. The spec's only ask of the M1 freeze is that both are recorded; the actual
"open last quarter's version" UX is implementation-time. Honesty note: reproducibility holds
only for a document that was **frozen** at report time — a live report re-run today shows
today's data by design, which is correct, not a bug.

## 5. The concurrency constraint — decide now, design later  *(normative — a constraint, not a v1 design)*

Concurrent multi-author editing is **not** a v1 feature. But the format must not **preclude**
it, because retrofitting concurrency into a positional/whole-file format is a rewrite. The
constraint the M1 freeze must honor:

- **Cells are independent, named units** (§3.1 — names not coordinates), and a worksheet is a
  set of named exports, not an ordered grid. So an edit is scoped to a named cell, and a future
  merge is **per-cell** (two authors editing different cells never conflict; two editing the
  same cell is an ordinary text/CRDT merge on that cell's source). The named-cell model — chosen
  for review and agent-ergonomics — *already* satisfies this; the constraint is simply **don't
  regress it** (no positional cell identity, no whole-file-as-the-unit format).

That one sentence is the entire up-front concurrency cost. The CRDT/merge design itself is
deferred.

## 6. Load-bearing assumptions & code anchors

### Depends-on-today (verified 2026-07-09)

| Assumption (existing behavior the design rests on) | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| The platform already has an app-level `package.json` freshness-enum precedent (a document-compat analogue) | `new-project-template/README.md` | `requireLatest` |

### Must-establish (new invariants the implementation creates)

| New invariant | Proven by (gate test) |
|---|---|
| Every document carries a `format` major + derived `compat` ranges + stamped `authoredWith` | envelope test: a saved document has a valid `compat` block the host derived from its imports/uses |
| An old app opening a newer-stdlib document degrades legibly per cell, never silently | forward-compat gate: a document using a callable the app lacks renders a "needs stdlib ≥ x" tile, not a wrong value |
| An unknown `format` major is refused, not partially parsed | format-refusal gate: a `format` the app predates yields a legible refusal |
| A frozen report + `authoredWith` reproduces its numbers on re-run | reproducibility gate: re-running the recorded versions over the frozen frame reproduces the reported values |
| Cell identity is name-based, not positional (concurrency not precluded) | format-constraint check: no positional cell identity anywhere in the schema |

## 7. Decisions & rejected alternatives

- **A version *envelope* (ranges + provenance) in v1; migrations deferred.** *Rejected:*
  shipping the format with no version field (retrofitting is a per-document migration); building
  the full migration/codemod machinery up-front (implementation-time; the envelope makes it
  tractable without pre-building it).
- **Host-derived `compat` lower bounds, not author-maintained.** *Rejected:* asking authors to
  hand-maintain version ranges (rots; the host already does the static analysis for the
  dependency graph).
- **Additive-only stdlib/catalog does forward-compat; the envelope only makes cross-major and
  old-app cases legible.** *Rejected:* per-version compatibility shims as the primary mechanism
  (additive-only makes them unnecessary within a major).
- **Reproducibility = `authoredWith` + freeze, not a separate feature.** *Rejected:* a bespoke
  version-history/time-travel store (over-built for v1; the freeze + provenance already suffice
  for "what did we report").
- **Constrain the format to name-based cell identity so concurrency is not precluded; defer the
  merge design.** *Rejected:* designing multi-author merge in v1 (not needed); a
  positional/whole-file format (would preclude a per-cell merge — a rewrite to add later).

## 8. Open questions

- **OQ-1 (catalog forks).** A fork ships new components (§3.3). A document authored against a
  fork's catalog opened in stock Reckoner hits the unknown-component path (fine) — but should
  `compat.catalog` be able to name a **fork identity**, or is "unknown component → placeholder"
  sufficient? Likely sufficient; confirm against the fork story.
- **OQ-2 (tier-tag encoding evolution).** §3 treats an unknown tier-tag as "fall back to
  host mount tier." Confirm that a *newer* tier encoding (finer granularity, per-column tiers if
  E-2 forces them) degrades safely to the coarser host tier and never *up*-labels.
- **OQ-3 (stdlib deprecation within additive-only).** Additive-only forbids removal — but a
  callable can be *discouraged*. Does `compat` need a "soft-deprecated since x" signal for the
  review surface, or is that out of scope for the envelope? Probably out of scope; note it.
