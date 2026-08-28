// Shadow-evaluation primitives (WHATIF_SHADOW_EVALUATION_SPEC §3–§4): the splice's typed
// refusals (G-WIF-1 — including the substring-ambiguity case), source patching (variants +
// the scratch module, G-WIF-8's refusal half), the dependents closure over descriptor deps
// (wildcards pre-expanded), and the pinned-baseline diffs (values + verdicts).
import { describe, expect, it } from 'vitest';
import type { AsyncPass } from './asyncEngine.ts';
import type { CellDescriptor, SubjectResult } from './worker/protocol.ts';
import { contentKey } from './hash.ts';
import {
  spliceFormulaInSpan,
  SCRATCH_WORKSHEET,
  dependentsClosure,
  diffPasses,
  diffVerdicts,
  patchSources,
  spliceFormula,
} from './shadow.ts';
import type { Value } from '../stdlib/types.ts';

function cellDesc(id: string, deps: string[] = [], formulaSource = ''): CellDescriptor {
  const [worksheet, cell] = id.split('.');
  return { id, worksheet, cell, doc: '', formulaSource, deps, externals: [], resolvers: [] };
}

function pass(results: Record<string, Value>, errors: Record<string, string> = {}): AsyncPass {
  return {
    results: new Map(
      Object.entries(results).map(([id, value]) => [id, { id, value, tier: 'static' as const, key: contentKey(value) }]),
    ),
    errors: new Map(Object.entries(errors)),
    quarantined: [],
  };
}

describe('spliceFormula (G-WIF-1)', () => {
  it('replaces a uniquely-occurring formula', () => {
    const out = spliceFormula('const a = cell({ formula: (x) => x.v + 1 });', '(x) => x.v + 1', '(x) => x.v * 2');
    expect(out).toEqual({ ok: true, source: 'const a = cell({ formula: (x) => x.v * 2 });' });
  });

  it('refuses a formula that is not found — never a silent wrong patch', () => {
    expect(spliceFormula('const a = 1;', '(x) => x', '(y) => y')).toEqual({ ok: false, code: 'formula-not-found' });
  });

  it('refuses identical formulas (two occurrences)', () => {
    const sheet = 'const a = cell({ formula: () => 1 });\nconst b = cell({ formula: () => 1 });';
    expect(spliceFormula(sheet, '() => 1', '() => 2')).toEqual({ ok: false, code: 'formula-ambiguous' });
  });

  it('refuses the SUBSTRING case: a short formula inside a longer one', () => {
    const sheet = 'const a = cell({ formula: (i) => i.x });\nconst b = cell({ formula: (i) => i.x + 1 });';
    expect(spliceFormula(sheet, '(i) => i.x', '(i) => i.y')).toEqual({ ok: false, code: 'formula-ambiguous' });
  });
});

describe('patchSources (§3.1/§3.2)', () => {
  const cells = [cellDesc('model.a', [], '(x) => x.v'), cellDesc('model.b', ['model.a'], '({ a }) => a * 2')];
  const sources = { model: 'export const a = cell({ formula: (x) => x.v });\nexport const b = cell({ formula: ({ a }) => a * 2 });' };

  it('splices a variant into its worksheet and leaves others untouched', () => {
    const out = patchSources(sources, cells, { variants: { 'model.b': '({ a }) => a * 3' } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.sources.model).toContain('a * 3');
      expect(out.sources.model).toContain('(x) => x.v');
    }
  });

  it('adds the scratch module under the reserved worksheet name', () => {
    const out = patchSources(sources, cells, { scratch: 'export const probe = cell({ formula: () => 1 });' });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.sources[SCRATCH_WORKSHEET]).toContain('probe');
  });

  it('refuses a scratch module when the document already has a scratch worksheet (G-WIF-8)', () => {
    const out = patchSources({ ...sources, scratch: '// taken' }, cells, { scratch: '// mine' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('scratch-collision');
  });

  it('refuses a variant for an unknown cell', () => {
    const out = patchSources(sources, cells, { variants: { 'model.nope': '() => 0' } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('unknown-cell');
  });

  it('fails closed: one refusing variant aborts the whole patch', () => {
    const clashing = [cellDesc('model.a', [], '() => 1'), cellDesc('model.b', [], '() => 1')];
    const src = { model: 'export const a = cell({ formula: () => 1 });\nexport const b = cell({ formula: () => 1 });' };
    const out = patchSources(src, clashing, { variants: { 'model.a': '() => 2' } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatchObject({ code: 'formula-ambiguous', cellId: 'model.a' });
  });
});

describe('dependentsClosure (§4)', () => {
  it('walks a chain and a diamond, roots included', () => {
    const cells = [
      cellDesc('m.a'),
      cellDesc('m.b', ['m.a']),
      cellDesc('m.c', ['m.a']),
      cellDesc('m.d', ['m.b', 'm.c']),
      cellDesc('m.e', ['m.d']),
      cellDesc('m.unrelated'),
    ];
    expect([...dependentsClosure(cells, ['m.a'])].sort()).toEqual(['m.a', 'm.b', 'm.c', 'm.d', 'm.e']);
    expect([...dependentsClosure(cells, ['m.d'])].sort()).toEqual(['m.d', 'm.e']);
  });

  it('sees wildcard edges, which the build pre-expands into deps', () => {
    // A `checks.total` over `m.*` arrives with every m-cell in deps — the closure needs no
    // wildcard handling of its own.
    const cells = [cellDesc('m.a'), cellDesc('m.b'), cellDesc('checks.total', ['m.a', 'm.b'])];
    expect([...dependentsClosure(cells, ['m.b'])].sort()).toEqual(['checks.total', 'm.b']);
  });
});

describe('diffPasses (§4)', () => {
  it('reports changed / new-error / error-cleared / error-changed and omits identical cells', () => {
    const base = pass({ 'm.a': 1, 'm.b': 2, 'm.e': 5 }, { 'm.c': 'boom', 'm.d': 'old' });
    const shadow = pass({ 'm.a': 1, 'm.b': 3, 'm.c': 9 }, { 'm.d': 'new', 'm.e': 'now errors' });
    const deltas = diffPasses(base, shadow, ['m.a', 'm.b', 'm.c', 'm.d', 'm.e']);
    expect(deltas).toEqual([
      { id: 'm.b', kind: 'changed', before: 2, after: 3 },
      { id: 'm.c', kind: 'error-cleared', beforeError: 'boom', after: 9 },
      { id: 'm.d', kind: 'error-changed', beforeError: 'old', afterError: 'new' },
      { id: 'm.e', kind: 'new-error', before: 5, afterError: 'now errors' },
    ]);
  });

  it('decides "changed" by contentKey, so structurally-equal values are unchanged', () => {
    const base = pass({ 'm.a': { x: 1, y: [2] } as unknown as Value });
    const shadow = pass({ 'm.a': { y: [2], x: 1 } as unknown as Value });
    expect(diffPasses(base, shadow, ['m.a'])).toEqual([]);
  });
});

describe('diffVerdicts (§4)', () => {
  const subj = (subject: string, verdict: SubjectResult['verdict']): SubjectResult => ({ subject, verdict, outcomes: [] });

  it('reports flipped subjects both ways, treating absence as untested', () => {
    const base = new Map([
      ['m.a', subj('m.a', 'validated')],
      ['m.b', subj('m.b', 'failing')],
    ]);
    const shadow = new Map([
      ['m.a', subj('m.a', 'failing')],
      ['m.b', subj('m.b', 'failing')],
      ['scratch.p', subj('scratch.p', 'pinned')],
    ]);
    expect(diffVerdicts(base, shadow).sort((a, b) => a.subject.localeCompare(b.subject))).toEqual([
      { subject: 'm.a', before: 'validated', after: 'failing' },
      { subject: 'scratch.p', before: 'untested', after: 'pinned' },
    ]);
  });

  it('handles a null base (no suite run yet)', () => {
    const shadow = new Map([['m.a', subj('m.a', 'failing')]]);
    expect(diffVerdicts(null, shadow)).toEqual([{ subject: 'm.a', before: 'untested', after: 'failing' }]);
  });
});

describe('spliceFormulaInSpan (R3-427)', () => {
  //             0         1         2         3         4         5         6         7
  //             0123456789012345678901234567890123456789012345678901234567890123456789012345
  const sheet = 'export const a = cell({ formula: () => 1 });\nexport const b = cell({ formula: () => 1 });\n';
  const spanA = { start: 0, end: 45 };
  const spanB = { start: 45, end: sheet.length };

  it('identical formulas in two cells splice unambiguously, each within its own block', () => {
    const a = spliceFormulaInSpan(sheet, spanA, '() => 1', '() => 2');
    expect(a).toEqual({ ok: true, source: sheet.replace('formula: () => 1 });\nexport', 'formula: () => 2 });\nexport') });
    const b = spliceFormulaInSpan(sheet, spanB, '() => 1', '() => 3');
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.source.slice(spanB.start)).toContain('() => 3');
      expect(b.source.slice(0, spanB.start)).toContain('() => 1'); // a untouched
    }
  });

  it('a short formula that is a substring of another cell splices without refusal', () => {
    const s = 'export const long = cell({ formula: (i) => i.x + 1 });\nexport const short = cell({ formula: (i) => i.x });\n';
    const shortSpan = { start: s.indexOf('export const short'), end: s.length };
    const out = spliceFormulaInSpan(s, shortSpan, '(i) => i.x', '(i) => i.y');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.source).toContain('(i) => i.y });');
      expect(out.source).toContain('(i) => i.x + 1'); // the long cell untouched
    }
  });

  it('keeps the typed refusals for the degenerate within-block cases', () => {
    expect(spliceFormulaInSpan(sheet, spanA, '() => 9', 'x')).toEqual({ ok: false, code: 'formula-not-found' });
    const twice = 'export const t = cell({ formula: () => 1, note: "() => 1" });\n';
    expect(spliceFormulaInSpan(twice, { start: 0, end: twice.length }, '() => 1', 'x')).toEqual({ ok: false, code: 'formula-ambiguous' });
  });
});

describe('patchSources with spans (R3-427)', () => {
  it('two variants in one worksheet apply in descending block order — earlier spans stay valid', () => {
    const sheet = 'export const a = cell({ formula: () => 1 });\nexport const b = cell({ formula: () => 1 });\n';
    const mk = (id: string, start: number, end: number): CellDescriptor => ({
      ...cellDescFor(id), formulaSource: '() => 1', span: { start, end, line: 1 },
    });
    const cells = [mk('m.a', 0, 45), mk('m.b', 45, sheet.length)];
    const out = patchSources({ m: sheet }, cells, { variants: { 'm.a': '() => 10', 'm.b': '() => 20' } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.sources.m).toContain('const a = cell({ formula: () => 10');
      expect(out.sources.m).toContain('const b = cell({ formula: () => 20');
    }
  });
});

function cellDescFor(id: string): CellDescriptor {
  const [worksheet, cell] = id.split('.');
  return { id, worksheet, cell, doc: '', formulaSource: '', deps: [], externals: [], resolvers: [] };
}
