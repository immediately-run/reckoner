// The workbook-level suite report — S4a, the in-platform document-test gate
// (`docs/AXIS2_SELF_HOSTING_WORKITEMS.md` S4; roadmap R3-231).
//
// S2 already put document tests in the browser: tests are cells, they run on the
// recalc graph, and the workbook panel renders a verdict per cell. What was missing is
// the thing `npm test` gives you in one line — *did the suite pass, and what is the
// coverage* — without reading every card. That is all this module is: the dogfooded
// equivalent of a test-runner summary, for document content.
//
// The one design rule, and it is the item's exit criterion rather than a preference:
// **the summary is computed from the same `SubjectResult.verdict` the review surface
// renders.** Not recomputed from outcomes, not re-classified with a second copy of the
// §6 rule. A summary that could disagree with the cards beneath it would be worse than
// no summary — it would make the author choose which surface to believe, and the whole
// point of a one-action gate is that its answer IS the answer.
//
// So `classifyCell` stays the single owner of "what does this cell's coverage mean" and
// this module only counts. If the verdict rule changes the summary follows for free;
// there is no second place to update and therefore no second place to forget.
//
// Not here, deliberately: **mutation score**. S4a's acceptance is the verdict summary;
// the mutation leg is "(later)" in the work item and needs a mutation runner the engine
// does not have. `mutationScore` is an optional field so the shape need not change when
// it lands, and absent means absent — never a zero that would read as a measured score.

import type { CellVerdict } from './testrunner.ts';
import type { CellDescriptor, SubjectResult } from './worker/protocol.ts';

export interface SuiteReport {
  /** Cells in the workbook — the denominator. */
  total: number;
  /** Counts per verdict. They sum to `total`: a cell with no suite result counts
   *  `untested`, which is exactly what the panel renders for it. */
  validated: number;
  pinned: number;
  untested: number;
  failing: number;
  /** The subjects that failed, so the author can go straight to them. */
  failingSubjects: string[];
  /** `true` iff nothing failed. Coverage is reported separately and on purpose: a
   *  workbook of entirely untested cells is GREEN by this measure, which is honest —
   *  nothing is broken — and would be a lie to call "passing coverage". The two numbers
   *  answer different questions and are not collapsed into one. */
  ok: boolean;
  /** Mutation score, when a mutation run has been performed. Absent ⇒ not measured. */
  mutationScore?: number;
  /** The one-line summary an author reads instead of scanning cards. */
  line: string;
}

/**
 * Summarize a workbook run. Pure. `results` is the map the review surface holds; a cell
 * absent from it is `untested`, exactly as `WorkbookPanelBody` renders it.
 */
export function summarizeSuite(
  cells: readonly CellDescriptor[],
  results: ReadonlyMap<string, SubjectResult> | null,
  opts?: { mutationScore?: number },
): SuiteReport {
  const counts: Record<CellVerdict, number> = { validated: 0, pinned: 0, untested: 0, failing: 0 };
  const failingSubjects: string[] = [];
  for (const cell of cells) {
    const verdict: CellVerdict = results?.get(cell.id)?.verdict ?? 'untested';
    counts[verdict] += 1;
    if (verdict === 'failing') failingSubjects.push(cell.id);
  }
  const report: SuiteReport = {
    total: cells.length,
    validated: counts.validated,
    pinned: counts.pinned,
    untested: counts.untested,
    failing: counts.failing,
    failingSubjects,
    ok: counts.failing === 0,
    ...(opts?.mutationScore !== undefined ? { mutationScore: opts.mutationScore } : {}),
    line: '',
  };
  return { ...report, line: summaryLine(report) };
}

/** The fields {@link summaryLine} reads. */
export type SuiteSummaryCounts = Pick<
  SuiteReport,
  'total' | 'validated' | 'pinned' | 'untested' | 'failing' | 'mutationScore'
>;

/**
 * The summary line. Says the failure count FIRST when there is one, because that is the
 * thing an author needs and a leading "12 validated" buries it.
 *
 * `validated` and `pinned` stay separate words here for the same reason §6 keeps them
 * separate on the cards: an inferred formula reproduces its own fitting data by
 * construction, so example-based coverage is regression evidence, and adding the two
 * together in one line would undo that distinction in the one place an author is most
 * likely to read.
 */
export function summaryLine(r: SuiteSummaryCounts): string {
  if (r.total === 0) return 'No cells to test.';
  const parts: string[] = [];
  if (r.failing > 0) parts.push(`${r.failing} failing`);
  parts.push(`${r.validated} validated`, `${r.pinned} pinned`, `${r.untested} untested`);
  if (r.mutationScore !== undefined) parts.push(`mutation ${Math.round(r.mutationScore * 100)}%`);
  const head = r.failing > 0 ? 'Suite failed' : 'Suite passed';
  return `${head} — ${parts.join(' · ')} of ${r.total} ${r.total === 1 ? 'cell' : 'cells'}.`;
}
