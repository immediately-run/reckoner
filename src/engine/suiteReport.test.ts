// S4a — the in-platform document-test gate (`AXIS2_SELF_HOSTING_WORKITEMS` S4;
// roadmap R3-231).
//
// The item's acceptance is one sentence: "an author runs the workbook suite from the
// editor and sees the SAME verdicts the review surface shows — no terminal." So the
// load-bearing test is not that the counts add up; it is that the summary is a function
// of the very map `WorkbookPanelBody` renders from, and therefore cannot disagree with it.
import { describe, it, expect } from 'vitest';
import { summarizeSuite, summaryLine } from './suiteReport.ts';
import { classifyCell } from './testrunner.ts';
import type { CellDescriptor, SubjectResult } from './worker/protocol.ts';

const cell = (id: string): CellDescriptor => ({
  id,
  worksheet: id.split('.')[0],
  cell: id.split('.')[1],
  doc: '',
  formulaSource: '() => 1',
  deps: [],
  externals: [],
  resolvers: [],
});

const result = (subject: string, verdict: SubjectResult['verdict']): [string, SubjectResult] => [
  subject,
  { subject, verdict, outcomes: [] },
];

describe('summarizeSuite — the workbook-level answer', () => {
  it('counts every verdict, and the counts sum to the cell count', () => {
    const cells = ['rev.a', 'rev.b', 'rev.c', 'rev.d'].map(cell);
    const results = new Map([result('rev.a', 'validated'), result('rev.b', 'pinned'), result('rev.c', 'failing')]);
    const r = summarizeSuite(cells, results);
    expect(r).toMatchObject({ total: 4, validated: 1, pinned: 1, failing: 1, untested: 1, ok: false });
    expect(r.validated + r.pinned + r.failing + r.untested).toBe(r.total);
    expect(r.failingSubjects).toEqual(['rev.c']);
  });

  it('a cell absent from the results is `untested` — the same thing the cards render', () => {
    // `WorkbookPanelBody` does `results?.get(cell.id)?.verdict ?? 'untested'`. If this
    // module chose a different default the summary and the cards would disagree about a
    // workbook that has never been run, which is the most common state of all.
    const r = summarizeSuite([cell('rev.a')], new Map());
    expect(r.untested).toBe(1);
    expect(summarizeSuite([cell('rev.a')], null).untested).toBe(1);
  });

  it('the summary uses the SAME verdicts the review surface shows — not a second classification', () => {
    // Drive it end-to-end from `classifyCell`, the §6 owner of the rule: whatever it says
    // about these outcomes is what the summary must count. If a second copy of the rule
    // ever appeared in `suiteReport`, this is the test that would catch the divergence.
    const outcomes = [
      { subject: 'rev.a', kinds: [{ kind: 'metamorphic' as const, pass: true }] },
      { subject: 'rev.b', kinds: [{ kind: 'specification' as const, pass: true }] },
      { subject: 'rev.c', kinds: [{ kind: 'property' as const, pass: false }] },
    ];
    const results = new Map(outcomes.map((o) => result(o.subject, classifyCell(o.kinds))));
    const r = summarizeSuite(outcomes.map((o) => cell(o.subject)), results);
    expect(r.validated).toBe(1); // metamorphic
    expect(r.pinned).toBe(1); // specification only — regression evidence, not validation
    expect(r.failing).toBe(1);
  });

  it('`ok` means nothing FAILED — it does not mean the workbook is covered', () => {
    // A workbook of entirely untested cells is green by this measure. That is honest
    // (nothing is broken) and it is why coverage is reported next to it rather than
    // folded into one number that would read as a pass.
    const r = summarizeSuite(['rev.a', 'rev.b'].map(cell), new Map());
    expect(r.ok).toBe(true);
    expect(r.untested).toBe(2);
    expect(r.line).toContain('2 untested');
  });
});

describe('summaryLine — what the author actually reads', () => {
  const base = { total: 10, validated: 4, pinned: 3, untested: 3, failing: 0 };

  it('leads with the failure count when there is one', () => {
    const line = summaryLine({ ...base, failing: 2, untested: 1 });
    expect(line.startsWith('Suite failed — 2 failing')).toBe(true);
  });

  it('keeps validated and pinned as separate words — never added together', () => {
    // §6's whole point: an inferred formula reproduces its own fitting data by
    // construction, so "7 tested" would be the theater the verdict rule prevents.
    const line = summaryLine(base);
    expect(line).toContain('4 validated');
    expect(line).toContain('3 pinned');
    expect(line).not.toContain('7 ');
  });

  it('reports a mutation score only when one was measured', () => {
    expect(summaryLine(base)).not.toContain('mutation');
    expect(summaryLine({ ...base, mutationScore: 0.62 })).toContain('mutation 62%');
    // An absent score is absent, never a zero that would read as a measured 0%.
    expect(summaryLine({ ...base, mutationScore: 0 })).toContain('mutation 0%');
  });

  it('says something sensible for an empty workbook and for a single cell', () => {
    expect(summaryLine({ total: 0, validated: 0, pinned: 0, untested: 0, failing: 0 })).toBe('No cells to test.');
    expect(summaryLine({ total: 1, validated: 1, pinned: 0, untested: 0, failing: 0 })).toContain('of 1 cell.');
  });
});
