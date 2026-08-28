// The reflection port (AUTHORS_VIEW_SPEC §3) — the optional context the reflection
// components read, provided by `ReportView` ONLY for the author's-view render (spec §6:
// where reflection may render is a product decision, made structural by withholding this
// port everywhere else). Everything here is the document describing itself; the fixture
// and feed shapes are ALLOWLIST projections assembled app-side (§3.1–§3.3) — never raw
// document config, never secret material, never a spread.
import { createContext, useContext } from 'react';
import type { CellDescriptor, SubjectResult, TestDescriptor } from '../../engine/worker/protocol.ts';

/** A fixture's derived shape summary (spec §3.1 — derived, labeled as derived). */
export interface FixtureSummary {
  name: string;
  rowCount: number;
  /** Keys of the FIRST row — an O(1) bound that can under-describe heterogeneous rows; rendered with that qualifier. */
  firstRowColumns: readonly string[];
  /** The document-AUTHORED tier tag — advisory, rendered as plain labeled data, never chrome (§3.2). */
  declaredTier?: string;
  /** Provenance note (`captured from <feed>`), when the fixture carries one. */
  sourceFeed?: string;
}

/** A feed's allowlisted projection (spec §3.3): name, mode, scheme+host only. */
export interface FeedSummary {
  name: string;
  mode?: string;
  /** Per source entry: scheme + host with path/query/userinfo stripped, or the literal 'unparseable source'. */
  hosts: readonly string[];
}

export interface ReflectionPort {
  cells(): readonly CellDescriptor[];
  tests(): readonly TestDescriptor[];
  /** The SAME suite-results object the review chrome renders (§3.4); null = pending, which is not a verdict (§2.3). */
  verdicts: ReadonlyMap<string, SubjectResult> | null;
  fixtures: readonly FixtureSummary[];
  feeds: readonly FeedSummary[];
}

export const ReflectionContext = createContext<ReflectionPort | null>(null);

/** The port, or null when this render is not the author's view (components degrade). */
export function useReflection(): ReflectionPort | null {
  return useContext(ReflectionContext);
}
