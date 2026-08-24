// Cross-reference validation (the deferred item in the barrel header). Two dangling-reference
// classes that otherwise surface as *silent nulls* at run time — a cell reading `feeds.ghost`
// resolves null forever and the report shows a blank where a number should be, with nothing
// saying why:
//
//   1. a worksheet input naming a feed/fixture the document does not declare (needs the
//      evaluated workbook's external references, so it is composed app-side where the
//      engine and the loaded document meet — `validateExternalReferences`);
//   2. a fixture's `sourceFeed` naming a missing feed (pure document knowledge — the loader
//      runs it directly — `validateFixtureProvenance`).
//
// Severity is a function of how *suppliable* the missing thing is: feeds/fixtures/statics
// name document-declared sources, so a miss is an error. Params are runtime-suppliable (a
// host or a widget may set a param the manifest does not default) — a warning, a probable
// typo. And fixture provenance is *historical*, not live (freezing detaches a fixture from
// its feed, §5.4), so a miss there is a warning too — interesting only if the author
// believed the fixture refreshable.

import type { DocumentDiagnostic, FixtureFile } from './types.ts';

/** One external a worksheet declares: the key it reads, the cell that reads it. */
export interface ExternalReference {
  /** The dotted key as declared: `feeds.orders`, `fixtures.holdout`, `params.region`, … */
  key: string;
  /** The declaring cell (`worksheet.cell`), for anchoring the diagnostic. */
  site: string;
}

/** What a document (+ the app running it) can actually supply. */
export interface XRefAvailability {
  /** Feed names suppliable now: the document's declared feeds plus any runtime feeds. */
  feeds: ReadonlySet<string>;
  /** The document's fixture names. */
  fixtures: ReadonlySet<string>;
  /** Param names statically known: manifest defaults + template widget names. */
  params: ReadonlySet<string>;
  /** Worksheet name → document-relative path, to anchor diagnostics at the declaring file. */
  worksheetPaths: Record<string, string>;
}

/**
 * Validate every worksheet external reference against what is suppliable. `feeds.*` /
 * `fixtures.*` / `static.*` name document-declared sources — a miss is an error. `params.*`
 * is a warning. Unknown namespaces are left alone: worksheet-cell references are resolved
 * by the graph builder, which already diagnoses them.
 */
export function validateExternalReferences(
  references: readonly ExternalReference[],
  available: XRefAvailability,
): DocumentDiagnostic[] {
  const out: DocumentDiagnostic[] = [];
  for (const { key, site } of references) {
    const sep = key.indexOf('.');
    if (sep === -1) continue;
    const ns = key.slice(0, sep);
    const name = key.slice(sep + 1);
    const file = available.worksheetPaths[site.slice(0, site.indexOf('.'))] ?? '';
    if (ns === 'feeds') {
      if (!available.feeds.has(name)) {
        out.push({
          severity: 'error',
          file,
          message: `input "${key}" (${site}): no feed named "${name}" is declared — the document's feeds/ directory${name === '' ? ' ' : ` (${[...available.feeds].join(', ')}) `}does not declare it, and no runtime feed supplies it. The cell resolves null.`,
        });
      }
    } else if (ns === 'fixtures') {
      if (!available.fixtures.has(name)) {
        out.push({
          severity: 'error',
          file,
          message: `input "${key}" (${site}): no fixture named "${name}" exists in fixtures/ (have: ${[...available.fixtures].join(', ') || 'none'}). The cell resolves null.`,
        });
      }
    } else if (ns === 'static') {
      // Nothing declares static values today — the namespace is reserved (§3.1) with no
      // document section for it yet, so any read is currently a structural null.
      out.push({
        severity: 'error',
        file,
        message: `input "${key}" (${site}): the static namespace is not declared by any document section yet — nothing can supply this value. The cell resolves null.`,
      });
    } else if (ns === 'params') {
      if (!available.params.has(name)) {
        out.push({
          severity: 'warning',
          file,
          message: `input "${key}" (${site}): no default for param "${name}" in the manifest and no widget sets it — a probable typo (known params: ${[...available.params].join(', ') || 'none'}).`,
        });
      }
    }
  }
  return out;
}

/**
 * Validate every fixture's capture provenance against the document's declared feeds. A
 * frame citing `sourceFeed: "orders"` when `feeds/order.feed.json` does not exist is
 * **historical provenance, not a live dependency** — freezing is exactly how a fixture
 * detaches from its feed (§5.4), and a fully-frozen document (the bundled demo is one)
 * legitimately cites feeds it no longer declares. So a miss is a *warning*: uninteresting
 * for a frozen snapshot, but exactly what an author wants to hear if they thought the
 * fixture was still refreshable from a declared feed. Synthetic fixtures legitimately carry
 * no `sourceFeed`.
 */
export function validateFixtureProvenance(
  fixtures: readonly FixtureFile[],
  declaredFeeds: ReadonlySet<string>,
): DocumentDiagnostic[] {
  const out: DocumentDiagnostic[] = [];
  for (const fx of fixtures) {
    const source = fx.frame.provenance.sourceFeed;
    if (source !== undefined && !declaredFeeds.has(source)) {
      out.push({
        severity: 'warning',
        file: fx.path,
        message: `fixture "${fx.name}" cites sourceFeed "${source}", which this document does not declare (declared: ${[...declaredFeeds].join(', ') || 'none'}) — fine for a frozen snapshot; declare the feed if this fixture is meant to be refreshable.`,
      });
    }
  }
  return out;
}
