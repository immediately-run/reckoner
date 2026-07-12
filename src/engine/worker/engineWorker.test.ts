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
