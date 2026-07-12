import { describe, it, expect } from 'vitest';
import * as stdlib from '../stdlib/index.ts';
import { evaluateWorksheet, evaluateConfined } from './compartment.ts';
import type { CellDef } from '../stdlib/cell.ts';
import type { Row } from '../stdlib/types.ts';

// A worksheet in its already-transpiled (plain JS) form, as the sandbox produces in-platform.
const WORKSHEET = `
import { cell, table, sum } from "@reckoner/stdlib";

export const by_month = cell({
  doc: "revenue by month",
  inputs: { orders: "feeds.orders" },
  formula: ({ orders }) => table(orders).groupBy("month").rollup({ revenue: sum("eur") }).rows(),
});

export const total = cell({
  doc: "total revenue",
  inputs: { m: "revenue.by_month" },
  formula: ({ m }) => m.reduce((a, r) => a + r.revenue, 0),
});

export const NOTE = "not a cell — must be ignored";
`;

describe('evaluateWorksheet — real SES Compartment', () => {
  it('extracts the registered cells (ignoring non-cell exports)', () => {
    const defs = evaluateWorksheet(WORKSHEET, stdlib);
    expect(Object.keys(defs).sort()).toEqual(['by_month', 'total']);
    expect(defs.by_month.kind).toBe('cell');
    expect(defs.by_month.dependencies).toEqual(['feeds.orders']);
    expect(defs.total.dependencies).toEqual(['revenue.by_month']);
  });

  it('the confined formula computes correctly using the endowed stdlib', () => {
    const defs = evaluateWorksheet(WORKSHEET, stdlib);
    const orders: Row[] = [
      { month: '2026-01', eur: 100 },
      { month: '2026-02', eur: 50 },
      { month: '2026-01', eur: 40 },
    ];
    const result = (defs.by_month as CellDef).formula({ orders });
    expect(result).toEqual([
      { month: '2026-01', revenue: 140 },
      { month: '2026-02', revenue: 50 },
    ]);
  });
});

describe('evaluateConfined — starvation', () => {
  it('evaluates with endowments and reaches no ambient globals', () => {
    expect(evaluateConfined('add(20, 22)', { add: (a: number, b: number) => a + b })).toBe(42);
    expect(evaluateConfined('typeof process')).toBe('undefined');
    expect(evaluateConfined('typeof fetch')).toBe('undefined');
    expect(evaluateConfined('typeof globalThis.require')).toBe('undefined');
  });

  it('a worksheet formula cannot reach ambient state either', () => {
    const src = `
      import { cell } from "@reckoner/stdlib";
      export const probe = cell({ doc: "probe", formula: () => typeof process });
    `;
    const defs = evaluateWorksheet(src, stdlib);
    expect((defs.probe as CellDef).formula({})).toBe('undefined');
  });
});
