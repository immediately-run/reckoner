# Status — Holdout redacted-mount view (D9)

**Overall: BUILT at the platform layer — the deny-by-default fs primitive, the realm
rule-sets, the host-brokered injection port, the credit classifier and the verdict rule
all hold and are gated. What remains is the Reckoner-side topology that uses them.**
· **Created:** 2026-08-27 (roadmap R3-228)

> This document is the **single implementation-status source** for
> [`specs/HOLDOUT_REDACTED_MOUNT_SPEC.md`](../specs/HOLDOUT_REDACTED_MOUNT_SPEC.md).
> Where the spec and this file disagree, this file governs.

## Read this before reading anything else here

D9 closes the **trivial** leaks: the direct `readFile` (H3) and the metadata probe. It
does **not** close the test-oracle channel (§5.1) and it adds little for the low-parameter
formulas Reckoner actually targets (§5.2). **Holdout is a tripwire, never a
certification**, and the review surface must never promote a holdout-only cell to
"validated" — which is now a test (G-HRM-8), not a convention.

## The gate ladder

| Gate | What it establishes | State | Where |
|---|---|---|---|
| **G-HRM-1** | The authoring realm's `rw@self` is the enumerated subtrees, never bare root | ✅ | `site-main/src/filesystem/holdoutScope.ts` — `mintRealmRules` **throws** rather than returning an exposing set |
| **G-HRM-2** | A held-out fixture is unreadable and un-probeable (`readFile`/`exists`/`stat`/`streamRead`, incl. traversal) | ✅ | primitive shipped in site-main#364; re-asserted against the minted rule-set in `holdoutScope.adversarial.test.ts` |
| **G-HRM-3** | Existence and name do not leak via `readdir` or metadata, at **every** reachable level | ✅ | same suite — checked through the real `synthesizedChildren`, at every ancestor the rule-set makes reachable |
| **G-HRM-4** | The engine resolves holdout without an assistant-visible path | ✅ | `filesystem/holdoutInjection.ts` — a NAME, never a path; path-shaped names are `invalid-params` before the table is consulted |
| **G-HRM-5** | Credit only for a host-fetched, never-agent-seen split | ✅ | `filesystem/holdoutEligibility.ts` — capture-then-infer, static sources and indeterminacy all classify `no-enforceable-holdout` at weight 0 |
| **G-HRM-6** | The blind second agent's scope is intent-only | ✅ | `holdoutScope.ts` — granting it `worksheets/` or `fixtures/` is refused at the mint |
| **G-HRM-7** | The fs filter is deny-by-default; an empty rule-set denies all | ✅ | shipped in site-main#364; **extended** here to the routing half (`applyScope` mis-routed a thunk `RuleScope` to the whole-mount chroot) |
| **G-HRM-8** | Holdout does not promote a cell to "validated" | ✅ | `reckoner/src/engine/testrunner.test.ts` — the rule predates D9; the gate pins it so it cannot be quietly re-promoted |

## What is NOT built

- **The `.holdout/` topology itself in a Reckoner document** — the host-performed
  pre-agent split, writing the withheld slice, and emitting the `specification` cells that
  reference it. The platform now has every primitive that work needs; none of it exists in
  the Reckoner engine yet.
- **Wiring the minted rule-sets into the live realm mounts.** `mintRealmRules` is the
  sanctioned way to build a realm's rule-set and is fully gated, but the assistant realm
  does not yet exist as a distinct `appKey` to mint one for — that is D7/AA-01.
- **Tracking the agent's read path per feed.** `classifyHoldoutSplit` consumes an
  `agentReadFeeds` set; nothing populates it yet. Until something does, every classification
  is `unknown-feed` ⇒ zero credit, which is the correct fail-closed default and also means
  no holdout currently earns credit.

## Residuals

- **The test-oracle channel (§5.1) is open, by design.** The agent authors the test cell
  that runs over the holdout and reads its result; trace-replay hands it the declared
  inputs, and a failure message leaks the exact aggregate. Suppressing results would taint
  the assistant every authoring iteration and break the loop. The correctness weight
  therefore lives in the oracle-free legs (metamorphic/property/mutation), which need no
  hidden data.
- **Reconstruction (§5.2) is central, not a corner.** For affine/aggregate/lookup formulas
  the training split *determines* the holdout by ordinary fitting.
- **Blind second-agent authoring is a weak signal (§7 / D9-3)** — agent-1 authors the `doc`
  agent-2 reads, so a complete intent over-determines the implementation.
