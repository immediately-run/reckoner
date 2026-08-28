// The author's view wiring (AUTHORS_VIEW_SPEC) — the built-in scaffold (§5.1), the
// template-selection rules (§4), and the reflection-port assembly (§3). All pure over
// session state; the React shell (`AuthorsView.tsx`) is glue.

import type { LoadedDocument } from '../document/types.ts';
import type { SubjectResult } from '../engine/worker/protocol.ts';
import type { AsyncEngine } from '../engine/asyncEngine.ts';
import type { FeedSummary, FixtureSummary, ReflectionPort } from '../report/index.ts';

/** The reserved author's-view template name (§4); `manifest.authorsView` overrides. */
export const AUTHORS_VIEW_TEMPLATE = 'authors_view';

/**
 * The built-in default view (§5.1) — also what a future "customize" materializes; the
 * two are the same document. Static heading (templates have no interpolation; the app
 * chrome names the document). Enumerate-everything components keep an unedited scaffold
 * complete forever (§2.1).
 */
export const AUTHORS_VIEW_SCAFFOLD = `# Author's view.

<SuiteSummary />

## Decisions.

No decisions recorded yet — the workbook's why lives here: what was chosen, what was
rejected, what the tests guard.

## Formulas.

<FormulaIndex />

## Data.

<DataInventory />

## Tests.

<TestIndex />
`;

/** The author's-view template name for this document (§4). */
export function authorsViewName(loaded: LoadedDocument): string {
  return loaded.manifest.authorsView ?? AUTHORS_VIEW_TEMPLATE;
}

/**
 * The consumer-report template (§4): today's `weekly` name-guess retained, over the
 * candidate set with the author's view excluded — a document whose templates sort as
 * `[authors_view, deal_summary]` must never serve its workings as the report.
 */
export function consumerTemplate<T extends { name: string }>(templates: readonly T[], authorsName: string): T | undefined {
  const candidates = templates.filter((t) => t.name !== authorsName);
  return candidates.find((t) => t.name === 'weekly') ?? candidates[0];
}

/** Scheme + host of one feed-source entry — path/query/userinfo stripped (§3.3). */
function hostOf(source: string): string {
  try {
    const url = new URL(source);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'unparseable source';
  }
}

/**
 * The fixture/feed halves of the reflection port — ALLOWLIST projections, built field by
 * field, never a spread (§3.1–§3.3). Derived once per loaded document (fixtures are
 * load-time static): rowCount is exact; columns are the FIRST row's keys, an O(1) bound
 * the component labels as such.
 */
export function dataSummaries(loaded: LoadedDocument): { fixtures: FixtureSummary[]; feeds: FeedSummary[] } {
  const fixtures: FixtureSummary[] = loaded.fixtures.map((fx) => ({
    name: fx.name,
    rowCount: fx.frame.rows.length,
    firstRowColumns: fx.frame.rows.length > 0 ? Object.keys(fx.frame.rows[0]) : [],
    declaredTier: fx.frame.tier,
    sourceFeed: fx.frame.provenance?.sourceFeed,
  }));
  const feeds: FeedSummary[] = loaded.feeds.map((feed) => {
    const sources = Array.isArray(feed.config.source) ? feed.config.source : [feed.config.source];
    return { name: feed.name, mode: feed.config.mode, hosts: sources.map(hostOf) };
  });
  return { fixtures, feeds };
}

/**
 * Assemble the reflection port (§3) from live session state. `verdicts` MUST be the same
 * results object the review chrome renders (§3.4, G-AV-10) — the caller passes the
 * app-level suite state, never a second computation.
 */
export function buildReflectionPort(
  engine: AsyncEngine,
  loaded: LoadedDocument,
  verdicts: ReadonlyMap<string, SubjectResult> | null,
): ReflectionPort {
  const { fixtures, feeds } = dataSummaries(loaded);
  return {
    cells: () => engine.cells(),
    tests: () => engine.tests(),
    verdicts,
    fixtures,
    feeds,
  };
}
