# Status — Connector egress-fixing (D2)

**Overall: PARTIALLY BUILT — the target-fixing core, the request-body cap and the pinned
secret path are implemented and gated; the `feed:fetch` protocol wiring and the consent
surface's rendering are the remainder.** *(2026-08-27: the protocol wiring and the SDK surface have
since landed — site-main #376, sdk 0.54.0. One new residual: the §3.1 path enforces no
credential-kind eligibility — roadmap R3-388, in Residuals below.)* · **Created:** 2026-08-27 (roadmap R3-227)

> This document is the **single implementation-status source** for
> [`specs/CONNECTOR_EGRESS_FIXING_SPEC.md`](../specs/CONNECTOR_EGRESS_FIXING_SPEC.md).
> Where the spec and this file disagree, this file governs.

## What "done" means here, and what it does not

The spec is emphatic on this and so is this file: egress-fixing **bounds a compromised
connector; it does not make one zero-exfil, and it does nothing against a hostile
author.** The honest claim after this work is the spec's own §4 wording —

> consented reach; write-to-fixed-host at declared-slot-entropy per request, completing
> within minutes; frequency-tripwired only.

Nothing below upgrades that to "safe", and a future reader should treat any summary that
does as a regression in the description, not an improvement in the mechanism.

## Built

| §  | Mechanism | Where | Gate |
|---|---|---|---|
| §2 | Trusted feed config compiles to a **frozen** request template; no URL surface | `immediately-run-site-main/src/registry/feedTemplate.ts` | `feedTemplate.test.ts` — §5 moves 1, 4, 5, 8 |
| §2 rule 2 | Typed data-plane slots (`iso8601` / bounded `int` / `enum`); a slot may not carry a host, path or new query key | same | param-confinement cases |
| §2 rule 2 | **Host-minted cursors**, opaque to the connector; extraction by a config-declared rule | `feedTemplate.ts` + `registry/feedInstance.ts` | `feedFetchHandler.test.ts` |
| §2 rule 3 | Request body fully templated **and byte-capped**, host-side and server-side | `feedTemplate.ts`, `immediately-run-backend/src/netFetch.ts` | `netFetch.test.ts` (incl. the UTF-8-vs-UTF-16 case) |
| §2 rule 4 | Template **deep-frozen** at compile time | `feedTemplate.ts` | frozen-template case |
| §2 rule 5 | **Host-minted instance id**; budget keyed on it; teardown revokes | `feedInstance.ts` | budget + teardown cases |
| §2.1 | Write-sink vs read-source consent descriptor: names it outbound, lists the cells sent, states the volume | `registry/writeSink.ts` | `writeSink.test.ts` |
| §3.1 | **Pinned secret path** — server-side header injection, caller cannot overwrite it, name stripped from the response, and **no browser-direct fallback on any failure** | `editor/feedFetchHandler.ts`, backend `netFetch.ts` | `feedFetchHandler.test.ts`, `netFetch.test.ts` |
| §2 rule 1 | `feed:fetch` exists as a capability distinct from `net:fetch` | `@immediately-run/preauth-core` 0.1.12 (`registry 1.7.0`) | `test/capabilities.test.ts` |

## Not built — the remainder, in the order it should land

1. **The `protocol-feed` gate row and dispatch** (`site-main` `registry/actionGate.ts`,
   `editor/requestDispatcher.ts`). Blocked on `@immediately-run/preauth-core` **0.1.12**
   being published: `MethodDef.capability` is typed `Capability`, and the vocabulary is
   the one source of truth for that union (`ways_of_working` §6 — a shared vocabulary is
   published once and consumed, never copied). Site-main deliberately did **not** bump its
   pin ahead of the publish, because a pin to an unpublished version turns every check in
   the repo red on `npm ci` and the informative one never runs.
2. **The SDK client surface** (`@immediately-run/sdk`) — a `feedFetch(instanceId, params)`
   wrapper. Until it exists no app can reach the handler, which is the intended order:
   enforcement ships before the authority it constrains (`ways_of_working` §1).
3. **Rendering** the §2.1 write-sink consent descriptor in the powerbox. The descriptor is
   computed and tested; drawing it is D6 (roadmap R3-229), whose composite consent plan
   already carries one step per feed with the descriptor attached.
4. **Per-hop redirect behaviour for an injected request.** The server re-resolves and
   re-validates every hop (built, T40), and the injected header rides the request across
   hops that passed those checks. Whether an injected credential should be dropped on a
   cross-origin hop even when that hop is allowlisted is not settled here; today the
   allowlist is a single origin per feed template, so the case is unreachable through
   `feed:fetch` — recorded because it becomes reachable the moment a template names more
   than one origin.

## Residuals — named, not closed

- **Declared-slot entropy (§4).** An `iso8601` slot carries ~30–50 bits per request, so a
  256-bit secret drains in single-digit on-cadence requests. The budget bounds
  requests-per-window, not bits-per-request, and therefore never fires on this. The code
  says so at the definition of `consume`, not only here.
- **Body reflection (§5 move 6).** A malicious allowlisted host can echo the injected
  credential in its response *body*, which the connector reads as data. Server-side
  injection removes the header from the connector's frame; it cannot remove the value
  from bytes the upstream chooses to send.
- **The hostile author (§2.1 / §5 move 9).** Target-fixing pins faithfully to whatever
  origin the config names. Consent legibility is the only defense, and it is
  **unvalidated** — the E3 comprehension study has not run and must now include an
  outbound-feed arm. A `POST`-with-cell-body feed is a named residual, not a contained
  threat.
- **Credential-kind eligibility on the §3.1 path is unenforced (roadmap R3-388, found
  2026-08-27).** `SECRETS_SPEC §2.1` C2 enumerates the backend-proxied carve-out **by resource
  kind** and says widening it "is a spec edit somebody has to write, not a judgement call at a call
  site". §3.1 widened it to a second consumer, the edit was not written, and **no layer checks the
  kind**: `feedTemplate.ts` types the selector `{ family?: string; type?: string }` (a free-form
  string, not `SecretType`) and copies it through unvalidated — while validating data-plane slot
  types strictly in the same compiler — and `resolveSecret` → `feedFetchHandler` inject whatever
  matches. The path that actually fires is an **omitted** type: `matchesSelector` treats a missing
  `type` as *match every kind*, so `injectSecret: { family: "acme" }` can select an `oauth-refresh`
  record — which C2 excludes **unconditionally** — and route it to the server. Bounded by the
  record existing, matching, and being `boundOrigin`-bound to that feed's origin under a grant this
  app holds. **This qualifies the §3.1 row above rather than retracting it:** the mechanism is
  built and sound; the gate on *which credential may use it* is missing. Note the scope — this is a
  **routing** widening (C5 cell **T1**), not a custody one; no feed credential is `platform-held`.
- **Availability cost of §3.1.** `feed:fetch` refuses when the pinned server path is
  unavailable rather than falling back. That is deliberate — the fallback path is the
  unpinned one — and it means a connector does not poll while the backend is down.
