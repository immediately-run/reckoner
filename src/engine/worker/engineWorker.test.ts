import { describe, expect, it } from 'vitest';
import { createEngineWorker } from './engineWorker.ts';

const SOURCES = {
  sheet: `import { cell } from "@reckoner/stdlib";
export const base = cell({ doc: "base", inputs: { x: "params.x" }, formula: ({ x }) => x + 1 });
export const dbl = cell({ doc: "double base", inputs: { b: "sheet.base" }, formula: ({ b }) => b * 2 });
`,
};

describe('createEngineWorker', () => {
  it('builds a serializable descriptor with topo order + externals (no formulas cross the wire)', () => {
    const w = createEngineWorker();
    const d = w.build(SOURCES);
    expect(d.order).toEqual(['sheet.base', 'sheet.dbl']);
    expect(d.externalInputs).toEqual(['params.x']);
    expect(d.cycles).toEqual([]);
    expect(d.cells.map((c) => c.id).sort()).toEqual(['sheet.base', 'sheet.dbl']);
    // The descriptor is structured-clone safe — no function anywhere in it.
    expect(() => structuredClone(d)).not.toThrow();
  });

  it('evaluates a cell formula against host-resolved inputs', () => {
    const w = createEngineWorker();
    w.build(SOURCES);
    expect(w.eval('sheet.base', { x: 5 })).toBe(6);
    expect(w.eval('sheet.dbl', { b: 6 })).toBe(12);
  });

  it('throws on an unknown cell', () => {
    const w = createEngineWorker();
    w.build(SOURCES);
    expect(() => w.eval('sheet.nope', {})).toThrow(/unknown cell/);
  });

  it('reports a dependency cycle in the descriptor', () => {
    const w = createEngineWorker();
    const d = w.build({
      s: `import { cell } from "@reckoner/stdlib";
export const a = cell({ doc: "a", inputs: { b: "s.b" }, formula: ({ b }) => b });
export const b = cell({ doc: "b", inputs: { a: "s.a" }, formula: ({ a }) => a });
`,
    });
    expect(d.cycles.length).toBeGreaterThan(0);
  });
});

describe('createEngineWorker — tests + the review surface', () => {
  const SOURCES_WITH_TESTS = {
    sheet: `import { cell, testCell, expectEqual, property } from "@reckoner/stdlib";
export const base = cell({ doc: "base cell", inputs: { x: "params.x" }, formula: ({ x }) => x + 1 });
export const base_check = testCell({
  kind: "specification",
  subject: "sheet.base",
  expect: ({ result }) => expectEqual(result, 3),
});
export const base_sane = testCell({
  kind: "property",
  subject: "sheet.base",
  relation: property("positive", (r) => r > 0),
});
export const other = cell({ doc: "untested", inputs: { b: "sheet.base" }, formula: ({ b }) => b * 2 });
`,
  };

  it('the descriptor carries cell docs and the test cards (kinds + subjects), clone-safe', () => {
    const w = createEngineWorker();
    const d = w.build(SOURCES_WITH_TESTS);
    expect(d.cells.find((c) => c.id === 'sheet.base')?.doc).toBe('base cell');
    expect(d.tests).toEqual([
      { id: 'sheet.base_check', worksheet: 'sheet', name: 'base_check', kind: 'specification', subject: 'sheet.base', inputs: {} },
      { id: 'sheet.base_sane', worksheet: 'sheet', name: 'base_sane', kind: 'property', subject: 'sheet.base', inputs: {} },
    ]);
    expect(() => structuredClone(d)).not.toThrow();
    expect(d.order).not.toContain('sheet.base_check'); // tests never enter the value graph
  });

  it('runSuites executes the closures worker-side and returns serializable verdicts', () => {
    const w = createEngineWorker();
    w.build(SOURCES_WITH_TESTS);
    const out = w.runSuites([{ subject: 'sheet.base', subjectValue: 3, inputs: { x: 2 } }]);
    expect(out).toHaveLength(1);
    // specification passes (3 === 3) + property passes → validated (the §6 rule)
    expect(out[0].verdict).toBe('validated');
    expect(out[0].outcomes.map((o) => [o.id, o.pass])).toEqual([
      ['sheet.base_check', true],
      ['sheet.base_sane', true],
    ]);
    expect(() => structuredClone(out)).not.toThrow();
  });

  it('a failing example test pins the cell as failing (any failure → failing)', () => {
    const w = createEngineWorker();
    w.build(SOURCES_WITH_TESTS);
    const out = w.runSuites([{ subject: 'sheet.base', subjectValue: 99, inputs: { x: 2 } }]);
    expect(out[0].verdict).toBe('failing');
    expect(out[0].outcomes.find((o) => o.id === 'sheet.base_check')?.pass).toBe(false);
  });

  it('a suite whose machinery crashes settles failing with the error recorded', () => {
    const w = createEngineWorker();
    w.build(SOURCES_WITH_TESTS);
    // expectEqual receives a non-number → its own guard fails it (not a crash); force a
    // crash by giving the subject a context whose inputs make the property throw.
    const out = w.runSuites([{ subject: 'sheet.base', subjectValue: null, inputs: { x: null } }]);
    expect(out[0].verdict).toBe('failing');
    expect(out[0].outcomes.every((o) => !o.pass)).toBe(true);
  });
});

describe('createEngineWorker — formula source crosses the wire for the value inspector', () => {
  it('the descriptor carries each formula\'s source text, clone-safe', () => {
    const w = createEngineWorker();
    const d = w.build(SOURCES);
    const base = d.cells.find((c) => c.id === 'sheet.base')!;
    expect(base.formulaSource).toContain('x + 1');
    expect(() => structuredClone(d)).not.toThrow();
  });
});
