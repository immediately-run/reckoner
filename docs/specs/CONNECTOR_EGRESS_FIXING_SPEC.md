# immediately.run Connector Egress-Fixing — host-fixed fetch targets for the dumb-pipe connector

**Status:** proposal / draft — addresses `REPORTING_SPREADSHEET_SPEC.md` §12 **Q3**; the D2 M0 design-sprint output of `../ARCHITECTURE_PLAN.md` §9/§10, **revised after adversarial-review-2** (`../ADVERSARIAL_REVIEW_2.md` §A). The reach-fixing core is sound; three additions were forced by the pass — a **pinned egress path for secret-bearing feeds** (§3.1, the built proxy is bypassed on the secret path), **host-minted opaque cursors + request-body cap** (§2, closing the connector-authored write channels), and **write-sink consent** (§2.1, for the author-hostile-template threat egress-fixing does not touch). The honest Q2 answer is **does not suffice to call the connector safe** — bounded, not eliminated. Design only; nothing here is built. · **Updated:** 2026-07-09

> **The single implementation-status source for this spec is
> `docs/status/CONNECTOR_EGRESS_FIXING_STATUS.md`** (to be created when build starts) —
> where this document and that one disagree, the status doc governs.

> **Reads first:** `REPORTING_SPREADSHEET_SPEC.md` §3.1 (reach-not-egress), §3.2 (the
> no-both invariant is an app discipline that **falls back onto this mechanism** against a
> metacircular-connector fork — RB-1), §4.5 (connector = dumb pipe), §12 Q2/Q3;
> `UI_AS_APPS_SPEC.md` §5.11 (host-proxied `net:fetch`); `HOST_ORIGIN_HARDENING_SPEC.md`
> §2.1 (the parent-fetch classes; server-side proxy); `SECRETS_SPEC.md` §6 (use-not-read
> secret injection); `TRUST_AND_SAFETY_SPEC.md` TS-4 (body-exfil residual), TS-5b
> (read+egress combo). Companion: `../ADVERSARIAL_REVIEW_1.md` (D2 is one of two
> undesigned deltas gating live).

---

## 0. The finding that reframes Q3  *(normative intent)*

Q3 has been described as "UNDESIGNED — the single most load-bearing gap." Reading the code
sharpens *and complicates* that: **an SSRF/DNS-rebinding/redirect-resistant egress proxy
exists on the *server* path** — `immediately-run-backend/src/netFetch.ts` resolves a hostname
to **all** its addresses, rejects if **any** is private/loopback/link-local/metadata, **pins**
the connection to the validated addresses (an undici `Agent` whose `lookup` returns only
those), follows redirects `manual` with a **per-hop re-resolve + re-validate** under a hop cap,
forwards **no** IR credentials, and size-bounds the *response* body. The host (`site-main`)
computes a **`manifest ∩ grant`** allowlist (`netFetchPolicy.ts` `effectiveAllowlist`).

> **Adversarial-review-2 correction (D2-F5) — do NOT claim "reuse the built pinning proxy
> unchanged."** The connector's dangerous feeds carry an injected secret (`injectSecret`), and
> `netFetchHandler.ts` issues secret-bearing requests **browser-direct**, deliberately *not*
> through the server proxy ("the value must never hit the server"). The browser path
> (`netFetchProxy.ts` `performGuardedFetch`) does **no DNS resolution and no pinning** — so for
> exactly the feeds that make the connector a TS-5b hazard, **DNS-rebinding is NOT contained.**
> This spec therefore has real work beyond the target-fixing layer: **a pinned egress path for
> secret-bearing connector feeds** (§3.1). The general (non-secret) feed does use the pinned
> server path — but its backend-unreachable fallback also drops pinning. Two shipped-code bugs
> in the blocklist were also found: IPv6 link-local matched `fe80`-only (misses `fe80::/10`),
> and hex IPv4-mapped IPv6 unmatched — filed separately.

So D2 is **not** "build Smokescreen," but it is also **not** "the proxy is done, just add
target-fixing." The genuinely-undesigned core is the **difference between an *allowlist* and a
*fixed target***, and it now has three parts (target-fixing §2, a pinned secret path §3.1, and
write-sink consent §2.1) — that difference is the whole of Q3:

- **`net:fetch` (built):** the *app* passes a **URL** on each call; the host checks it
  against the allowlist. Within the allowlisted host set, the app chooses freely — *which*
  host, *what* path, *what* request body, on *every* call.

So D2 is **not** "build Smokescreen." The SSRF layer is built for the general `net:fetch`
path. What is genuinely undesigned is the **difference between an *allowlist* and a *fixed
target*** — and that difference is the whole of Q3:

- **`net:fetch` (built):** the *app* passes a **URL** on each call; the host checks it
  against the allowlist. Within the allowlisted host set, the app chooses freely — *which*
  host, *what* path, *what* request body, on *every* call.
- **Connector egress-*fixing* (this spec):** a connector may be a **metacircular
  interpreter** (RB-1) — its own logic, and therefore *which allowlisted host it calls and
  what it puts in the body*, can be attacker-controlled by the very bytes it fetched. An
  allowlist that bounds the host *set* does **not** bound this: the connector still has
  per-call choice **inside** the set, and the request **body** is wide open (TS-4). The
  connector must therefore **not choose URLs at all**.

**The mechanism in one sentence:** the connector's fetch targets are **derived by the host
from the trusted feed configuration at grant time**, and the connector can only **fire
pre-registered request templates with bounded data-plane parameters** — it never passes a
URL, a host, a path, or a free-form body to the fetch layer. "Dumb pipe with host-fixed
targets" (spec §4.5) becomes concrete: *the pipe's shape is fixed by trusted config; the
connector only pumps it.*

---

## 1. Trust split: feed *config* is trusted, feed *content* is not  *(normative)*

This mechanism rests entirely on the spec §4.5 / §3.4 split, so it is restated as the load-
bearing premise:

- **`feeds/*.feed.json` is trusted configuration**, authored by the document author (or the
  user, via the gated feed-config write path — plan §8.2), reviewed as a diff, and carrying
  the auth secret *reference* (never a value). It declares the request shape.
- **Fetched bytes are untrusted content.** They may be adversarial (a calendar others write
  into; an API compromised upstream). They flow **into** the sheet as tainted data; they
  **never** flow **back out** as a fetch decision.

The egress-fixing invariant is exactly: **a fetch target and request body are a pure function
of trusted feed config + bounded, host-minted cursor state; never a function of fetched
content.** If that function ever takes a byte the connector fetched as input to *where the next
request goes or what its body carries*, the pipe has become agentic and the invariant is
broken.

> **"Trusted config" is not "benign config" (adversarial-review-2 D2-F4).** The invariant
> above contains a *compromised connector*. It does **nothing** against a **hostile document
> author** whose config declares the exfil target itself — a `POST` feed to `evil.com` with a
> `bodyTemplate` full of cell references pumps the sheet out, and egress-fixing "faithfully"
> pins to `evil.com`. Config is trusted for *integrity* (the connector can't change it), not
> for *intent* (the author might be hostile). The only thing between an author-hostile template
> and exfil is **consent legibility**, which §2.1 now makes load-bearing — because the connector
> is a **write-sink**, not only a read-source, and the powerbox has historically rendered the
> two identically.

## 2. The request template — what "fixed" means concretely  *(proposal — owned by D2)*

A feed definition compiles, **host-side at grant time**, to a frozen **request template**
the connector references by opaque **feed-instance id**, never by URL:

```jsonc
// feeds/orders.feed.json  — trusted config (the ONLY place a URL/host/path appears)
{
  "id": "orders",
  "request": {
    "origin": "https://api.example.com",         // fixed; the connector never sees a URL
    "pathTemplate": "/v2/orders",                 // fixed path (no interpolation of content)
    "method": "GET",
    "query": {
      "since": { "param": "cursor", "type": "iso8601" },   // a BOUNDED data-plane slot
      "limit": { "const": 500 }
    },
    "injectSecret": { "family": "example", "type": "api-key" }, // SECRETS_SPEC §6, host-injected
    "bodyTemplate": null                           // GET; see §4 for the POST case
  },
  "schedule": { "mode": "poll", "everyMs": 60000 },
  "retention": { "keepLast": 5000 }
}
```

The host derives from this: the **effective allowlist** (`{origin, paths:['/v2/orders'],
methods:['GET']}` — feeding the *existing* `netFetchPolicy`/`netFetch.ts` stack unchanged),
**and** the frozen template. The connector's only egress call is:

```ts
// what the connector may do — no URL, no host, no path, no free body
hostFeedFetch(feedInstanceId, { cursor: lastSeenIso });   // params validated against the template's typed slots
```

The host constructs the actual request from the **template + validated params**, runs it
through the built SSRF-pinning proxy (§0), and returns the bytes to the connector as tainted
data. Rules that make the fix real:

1. **No URL surface.** The connector API takes a feed-instance id + a typed param object.
   There is no code path from the connector to `fetch(url)` — the general `net:fetch`
   capability is **not granted** to the connector realm (it holds only `feed:fetch`, a
   distinct, template-bound capability). A connector that tries `fetch()` gets `forbidden`.
2. **Params are bounded data-plane slots, not target selectors, and carry no
   connector-authored bytes** (tightened, review-2 D2-F1/F2). A slot is typed (`iso8601`,
   `int(0..N)`, an enum) and appears **only** in the positions the template marks — a
   `query`/`bodyTemplate` value, never the origin, host, path, or a new query *key*. A slot's
   **information content is bounded and declared**, and the host enforces the type, so it cannot
   carry an arbitrary payload. **Pagination cursors are host-minted and opaque *to the
   connector*** (review-2 D2-F2 resolves the §1 contradiction): the connector never supplies
   or reads cursor bytes — the host extracts the next-page token from the response per a
   *config-declared* extraction rule (e.g. a JSONPath in the feed config, itself trusted
   config, not connector logic) and round-trips it. A connector-supplied or
   connector-round-tripped cursor is **forbidden**, because it is either connector-authored
   exfil or a function of fetched content — both break §1. *(Honest cost: the host must know
   each API's pagination shape via config; a feed whose pagination cannot be expressed as a
   declarative extraction rule is not expressible as a fixed feed — that is the price of the
   invariant, not a gap in it.)*
3. **The request body is fully templated; there is a body-size cap** (review-2 D2-F1). For a
   `POST` feed, `bodyTemplate` fixes the body; only typed slots vary; and the **request** body
   is size-capped host-side (the built proxy caps only the *response*). No connector-authored
   free body ever leaves.
4. **The template is frozen at grant time.** Editing `feeds/*.feed.json` is the gated
   feed-config write (plan §8.2, TS-19b) and re-derives the allowlist + re-consents if the
   origin/secret set widened. A running connector cannot mutate its own template.
5. **One connector instance per tier-class, per feed set** (spec §4.5 / plan §9): the
   instance's grant is the union of *its* feeds' templates and nothing else; two instances
   of one connector `appKey` share no source grant (the D1/D8 per-instance delegation gate).
   The per-instance fetch budget is keyed on a **host-minted** instance id (a
   connector-supplied id would let it mint fresh buckets, review-2 D2-F1).

### 2.1 Write-sink consent — a feed that writes is not a feed that reads  *(normative — review-2 D2-F4)*

Egress-fixing pins the target to the *config's* declared origin; against a hostile author that
origin *is* the attack (§1). The only defense is consent legibility, so it is made
load-bearing here, not left to the generic powerbox:

- **The consent surface must distinguish a write-sink from a read-source.** A feed whose
  `method` is `POST`/`PUT` or whose `bodyTemplate` is non-null is an **outbound** feed; the
  host consent must say so in plain language ("this feed *sends* data to `evil.com`"), not
  render it identically to an ingest feed.
- **It must show what leaves:** the `bodyTemplate`'s **cell references** (which cells' values
  are sent) and the **egress volume** (per the budget), so the user consents to the actual
  outbound reach, not an abstract "activate feed."
- **This reduces to the already-booked, still-unvalidated reach-consent-legibility residual**
  (spec §3.1/RB-6) — but on the **write** axis, which no aggregate-reach view yet surfaces.
  Until the reach view covers write-sinks (plan D6 + the E3 efficacy study, which now must
  include an outbound-feed comprehension arm), a `POST`-with-cell-body feed is a **named
  residual**, not a contained threat. Egress-fixing does not defend the user against their own
  document's author; consent legibility is the only thing that does, and it is unvalidated.

## 3. The layered stack (built + new)  *(reference for the built layers, proposal for the new)*

Egress-fixing is defense-in-depth; only the top layer is new.

| Layer | State | What it stops |
|---|---|---|
| **Target-fixing / request templating** (§2) | **NEW (D2)** | A metacircular connector choosing *which host / path / body* — the per-call choice an allowlist leaves open. **The load-bearing new layer.** |
| Per-instance fetch **budgets** (rate + volume), the anomaly tripwire | partial (`backend/src/rateLimit.ts` `consume` exists; per-feed-instance keying is new) | Slow-drip body-exfil (§4) and runaway loops — a *tripwire*, not a wall |
| `manifest ∩ grant` allowlist | **built** (`netFetchPolicy.ts` `effectiveAllowlist`) | Fetching an origin outside the derived set |
| Resolve-**all** + reject-if-any-private + **pin** | **built for the *non-secret* server path** (`netFetch.ts` `resolveAndValidate` + pinning `Agent`); **NOT on the secret/browser-direct path** (review-2 D2-F5) → §3.1 | DNS-rebinding onto a private/metadata IP (T16) — *contained only where the pinned path runs* |
| Per-hop redirect **re-resolve + re-validate**, `manual`, hop-capped | **built (server path)** (`netFetch.ts` `DEFAULT_MAX_REDIRECTS`) | A redirect bouncing to a non-fixed host (T40) |
| No IR credential forwarding; size-bounded **response** body | **built** (`netFetch.ts`) — **request-body cap is NEW** (§2 rule 3) | Stealing IR cookies; unbounded read; unbounded write |
| CSP `connect-src` on the connector frame | **built-adjacent** (per-frame CSP, plan D5) | Browser-native defense-in-depth if the connector tries a direct socket |
| Secret **injection** host-side, use-not-read (SECRETS_SPEC §6) | **built** (`netFetchPolicy` `injectSecret`) — but "never read" is **header-only** (review-2 D2-F3) | The connector reading the secret value from headers; injecting it into a non-templated request |

### 3.1 A pinned egress path for secret-bearing feeds  *(proposal — NEW, review-2 D2-F5)*

The connector's secret-bearing feeds currently route browser-direct (unpinned) so the secret
value never reaches the server. That trade — secret-confidentiality vs. rebind-resistance —
must be resolved *for the connector*, because its secret feeds are exactly the dangerous ones.
Options, to settle in build:

- **(a) Server-side injection into the pinned path.** Route connector feeds through the pinned
  server proxy and inject the secret **server-side** at the proxy (the value reaches the
  server, which already holds far more sensitive material and never returns it to the app).
  This gets pinning + per-hop redirect re-validation for secret feeds; the cost is the secret
  transiting the server boundary — acceptable for the connector's own bound host, gated by the
  feed's trusted config.
- **(b) Resolve-and-pin on the browser path.** Add DNS resolution + private-range rejection +
  connection pinning to the browser-direct path. Browsers cannot resolve DNS or pin a socket,
  so this is **not achievable** in-tab — which is *why* the server path exists. Rejected as
  infeasible; recorded so it is not re-proposed.

**Decision direction:** (a). The connector realm's `feed:fetch` runs through the pinned server
proxy with server-side secret injection; the browser-direct unpinned path is **not** used for
`feed:fetch`. Until this ships, secret-bearing feeds have **no rebind protection** and the spec
says so.

## 4. The residual, named honestly — request-body / param exfiltration (TS-4)  *(normative intent)*

The report (RQ-E1) and spec (TS-4) name the residual: **data can leave in the request *body*
or a bounded param to a *legitimately allowlisted* host.** Egress rules cannot close this.
Review-2 corrected the earlier draft's framing, which **understated the magnitude**:

- **The write channel is fast, not a slow drip** (review-2 D2-F1). The per-instance budget
  bounds **requests-per-time**, not **bits-per-request**, and the leak completes *at declared
  cadence*, so the "N× cadence" frequency tripwire never fires. A single constrained `iso8601`
  slot controls ~30–50 bits/request → a 256-bit secret drains in **~6–9 on-cadence requests**
  (minutes, indistinguishable from normal polling). The tightenings in §2 (host-minted opaque
  cursors, request-body cap, host-minted instance id) **remove the unbounded channels** (the
  connector-round-tripped cursor and the free body), leaving only the **declared typed-slot
  entropy** — still nonzero, still fast relative to a secret, honestly stated as:
  **"consented reach; write-to-fixed-host at declared-slot-entropy per request, completing
  within minutes; frequency-tripwired only."** Not "slow param drip."
- **What actually bounds it** is not the egress rule but the pair the report already named:
  **output tiering** (data reaching the connector is already M3-tainted — what it can exfil is
  data the user consented the connector to reach) + **write-sink consent** (§2.1 — the user saw
  that this feed sends data outbound). Neither is a wall; both are the accepted
  reach-not-egress posture.

The honest answer to spec **Q2** (is the backstop pair sufficient?): **no single mechanism
suffices, and the residual is a *fast* write channel, not a negligible one.** Egress-fixing
bounds *reach* (which host/path — genuinely contained, §5) and removes the *unbounded* write
channels; it bounds the *residual* write channel only to declared-slot entropy, backstopped by
tiering + consent legibility (both unvalidated). It does **not** make a compromised connector,
or a hostile author (§2.1), zero-exfil.

## 5. Adversarial pass — the metacircular-connector attack, walked  *(normative intent)*

The threat (spec §3.2 RB-1): the connector is a **metacircular interpreter** — it fetches
bytes and those bytes are, in effect, a program steering the connector. Walk every move.

1. **"Fetch a new host."** The connector's fetched bytes tell it to fetch
   `https://evil.test/steal`. → **Contained.** There is no URL surface (§2 rule 1); the
   connector can only fire `hostFeedFetch(id, params)`, and `id` resolves to a frozen
   template whose origin is `api.example.com`. `evil.test` is unnameable — the same
   "undeclared reads are unnameable" move as the formula engine, applied to egress.
2. **"Redirect me there."** The allowlisted origin (or adversarial content presented as a
   response) issues a 302 to `evil.test`. → **Contained (built, T40).** `redirect:'manual'`;
   the host re-resolves + re-validates the next hop against the allowlist and refuses.
3. **"Rebind DNS."** `api.example.com` re-resolves to `169.254.169.254` (metadata) between
   check and connect. → **Contained *only once §3.1 ships* (review-2 D2-F5).** The pinned
   server path contains it (resolve-all + reject-if-any-private + pin). **But today a
   secret-bearing feed routes browser-direct and is NOT pinned** — so until §3.1 (server-side
   secret injection on the pinned path), this move is **open for the dangerous feeds.** Honest
   status: contained on the non-secret path, open on the secret path, closed everywhere by §3.1.
4. **"Pick a different allowlisted host."** The connector has two feeds and content steers
   it to send feed-A's data to feed-B's origin. → **Contained.** Each `feed:fetch(id,…)` is
   bound to *one* template; there is no call that takes data-for-A and a target-of-B. The
   param slots can't carry a host. Cross-feed mixing would require encoding A's payload into
   B's typed slots — bounded to declared-slot entropy (→ §4).
5. **"Stuff exfil in the body / round-trip a fat cursor."** Content steers the connector to
   POST the sheet's secrets, or to round-trip a giant "cursor." → **Unbounded channels closed
   (review-2 D2-F1/F2); residual bounded to slot entropy.** `bodyTemplate` is fixed with a
   request-body cap (§2 rule 3); cursors are host-minted and opaque-to-connector (§2 rule 2),
   so the connector-authored free body and the round-tripped-cursor channels are **gone**. What
   remains is declared typed-slot entropy — fast relative to a secret but no longer unbounded
   (§4, the honest residual).
6. **"Steal the secret value."** → **Contained for headers; body-reflection is the residual
   (review-2 D2-F3).** The secret is injected by reference and the connector cannot read it from
   *headers* (`stripInjectedFromResponse`). **But a malicious allowlisted host can reflect the
   token in its response *body*,** which the connector reads as data. With server-side injection
   (§3.1) the value never reaches the connector's frame at all for the request, but the
   *reflected* value in a response body is a property of a malicious bound host and is **not**
   closed — named residual (narrow: needs a malicious host that already holds the user's key).
7. **"Loop to amplify."** Fire the template a million times. → **Tripwired, weakly (review-2
   D2-F1).** The per-instance budget flags *frequency* anomalies, but the §4 leak completes *at
   cadence* in minutes, which the tripwire never sees; and the underlying limiter is per-uid and
   fails open. The budget is a **backstop against runaway loops, not against the on-cadence
   drain** — stated honestly, not as containment.
8. **"Mutate my own template."** → **Contained.** Host-frozen at grant time (§2 rule 4); a
   widening is a gated feed-config write with re-consent, which the connector realm cannot
   perform on itself.
9. **"Be a hostile author, not a hostile connector" (review-2 D2-F4).** The *author* declares
   a `POST` feed to `evil.com` with a cell-reference `bodyTemplate`. → **NOT contained by
   egress-fixing** — it pins faithfully to the author's chosen exfil host. The only defense is
   **write-sink consent legibility (§2.1)**, which is unvalidated. This is the biggest residual
   and it is *outside* the compromised-connector threat the rest of this pass addresses.

**Verdict of the pass:** *reach*-fixing is sound — moves 1, 4, 8 fully contained by the new
target-fixing layer, move 2 by the built redirect re-validation. But: move 3 is **open on the
secret path until §3.1**; move 5's unbounded channels are closed but a **fast** slot-entropy
residual remains (move 7's tripwire does not catch it); move 6 has a body-reflection residual;
and move 9 (**author-hostile template**) is not an egress problem at all — it rides consent
legibility that is unvalidated. So the answer to spec Q2 is **the triple does NOT suffice to
call the connector safe**: it bounds a metacircular *connector* to "consented reach,
fast-slot-entropy write, weakly-frequency-tripwired," and it does **not** bound a hostile
*author* except via unvalidated write-sink consent. The
plan and spec must keep stating that residual; they must **not** upgrade this to "safe."

## 6. Load-bearing assumptions & code anchors

### Depends-on-today (verified against code 2026-07-09; re-checked by `scripts/check-spec-anchors.mjs`)

| Assumption (existing behavior the design rests on) | Anchor (repo-relative file) | Token (grep-stable) |
|---|---|---|
| The server-side proxy resolves + validates + **pins** to validated addresses | `immediately-run-backend/src/netFetch.ts` | `resolveAndValidate` |
| Redirects are followed `manual` with a per-hop re-validate under a hop cap | `immediately-run-backend/src/netFetch.ts` | `DEFAULT_MAX_REDIRECTS` |
| Resolved-IP blocklist covers private/loopback/link-local/metadata | `immediately-run-backend/src/netFetch.ts` | `isBlockedIp` |
| The effective allowlist is `manifest ∩ grant`, re-checked host-side | `immediately-run-site-main/src/registry/netFetchPolicy.ts` | `effectiveAllowlist` |
| Secret injection is host-side, by reference, use-not-read | `immediately-run-site-main/src/registry/netFetchPolicy.ts` | `injectSecret` |
| A guarded fetch is issued from the host, not the app frame | `immediately-run-site-main/src/editor/netFetchHandler.ts` | `performGuardedFetch` |
| Per-request budget/rate machinery exists to key per-instance | `immediately-run-backend/src/rateLimit.ts` | `consume` |

### Must-establish (new invariants the implementation creates)

| New invariant | Proven by (gate test) |
|---|---|
| The connector realm holds `feed:fetch` (template-bound), **not** general `net:fetch` | connector-caps gate: a connector calling `fetch()`/`net:fetch` gets `forbidden` |
| A fetch target is a pure function of frozen feed config + typed params; never of fetched content | egress-fixing gate: a hostile connector harness (metacircular) cannot cause a request to any host/path outside its feed templates, incl. via redirect/rebinding/param injection (moves 1–4, 8 of §5) |
| Data-plane params can occupy only template-marked slots and cannot carry a host/path/new key | param-confinement test: a param containing a URL/host/`../` path/new query key is rejected `invalid-params`, never fetched |
| The request body is templated AND size-capped; cursors are host-minted opaque | body-fix test: a connector cannot emit a request body outside `bodyTemplate`+slots, cannot exceed the request-body cap, and cannot supply/round-trip a cursor (review-2 D2-F1/F2) |
| Secret-bearing feeds run on the pinned server path | secret-pin gate: a secret feed whose host rebinds to a private/metadata IP is refused (review-2 D2-F5, §3.1) — proves the browser-direct unpinned path is not used for `feed:fetch` |
| A write-sink feed is consented as outbound, showing body cell-refs + volume | write-sink-consent gate: a `POST`/`bodyTemplate` feed's consent surface names it outbound and lists the cells sent (review-2 D2-F4, §2.1); a read feed does not |
| Per-feed-instance budget keyed on a host-minted id; bounds runaway loops (not the on-cadence drain) | budget test: a connector-supplied instance id cannot mint a fresh bucket; N× cadence trips; **the honest limit — an at-cadence drain is NOT caught — is documented** (review-2 D2-F1) |
| Template is frozen at grant time; a running connector cannot widen it | template-immutability test: a connector self-widening its origin set is refused; a config edit re-consents |

## 7. Decisions & rejected alternatives

- **Target-fixing by host-constructed request templates keyed by feed-instance id; the
  connector never passes a URL.** *Rejected:* giving the connector general `net:fetch` with
  a tight allowlist (leaves per-call host/path/body choice open to a metacircular fork — the
  exact RB-1 hole); an agentic connector that computes its own targets (spec §4.5 rejects).
- **Reuse the built SSRF-pinning proxy for the *non-secret* path; add a *pinned secret path*
  via server-side injection (§3.1, review-2 D2-F5).** *Rejected:* the earlier "reuse
  unchanged" claim (false — secret feeds route browser-direct/unpinned); resolve-and-pin in the
  browser (infeasible in-tab).
- **Cursors host-minted and opaque-to-connector; request body fully templated + size-capped
  (review-2 D2-F1/F2).** *Rejected:* the earlier "opaque cursor the host round-trips" slot (a
  connector-round-tripped cursor is either connector-authored exfil or a function of fetched
  content — both break §1); an uncapped request body.
- **Write-sink consent: a `POST`/body feed is consented as outbound, showing cell-refs +
  volume (§2.1, review-2 D2-F4).** *Rejected:* trusting "feed config is benign" (it is trusted
  for integrity, not intent — a hostile author's template is the attack); rendering a
  write-sink identically to a read-source in the powerbox.
- **State the residual as a *fast* write channel, backstopped by tiering + consent, never
  "safe" (review-2 D2-F1).** *Rejected:* the earlier "slow param drip" framing (the drain
  completes at cadence in minutes); claiming egress-fixing makes a compromised connector *or a
  hostile author* zero-exfil (the honest Q2 answer is "does not suffice to call safe").

## 8. Open questions

- **OQ-1 (feeds spec home).** The request-template schema (§2) is the connector's contract
  and may deserve its own `CONNECTOR_FEEDS_SPEC` rather than living in the Reckoner plan —
  decide when D2 build starts.
- **OQ-2 (streaming/subscription feeds).** §2 shows the poll case. A long-lived
  subscription (WebSocket/SSE) is still template-fixed for the *connect* target, but the
  per-message data plane needs the same "no target influence from content" proof — spell it
  out before building the subscription mode (interacts with plan RQ-C1/§5.2).
- **OQ-3 (Q2 sufficiency, escalated to the third fresh-agent pass).** §5 argues the
  triple bounds the fork; the spec's requested third adversarial pass should attack §5's
  moves 5/7 specifically — is param-entropy + budget a *tolerable* covert channel for the
  M3-reach the connector already has, or does a specific feed pattern make it unacceptable?
