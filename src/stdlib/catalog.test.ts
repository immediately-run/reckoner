import { describe, it, expect } from 'vitest';
import * as stdlib from './index.ts';
import { catalog, catalogNames } from './catalog.ts';

// Callables that are legitimately NOT part of the agent-facing formula surface, so they
// carry no self-description: the fluent classes, the engine-facing input utilities, and
// the internal deep-equality helper. Everything else that is a function MUST be described.
const NOT_DESCRIBED = new Set([
  'Table',
  'GroupedTable',
  'parseInput',
  'normalizeInputs',
  'dependencies',
  'deepEqual',
  'parseDuration', // a duration-parsing utility; `window` is the formula-facing surface
]);

const exportedCallables = Object.entries(stdlib)
  .filter(([, v]) => typeof v === 'function')
  .map(([k]) => k);

describe('self-description catalog gate (RQ-A5)', () => {
  it('every formula-facing callable has a self-description', () => {
    const undescribed = exportedCallables.filter(
      (name) => !NOT_DESCRIBED.has(name) && catalog[name] === undefined,
    );
    expect(undescribed).toEqual([]);
  });

  it('every catalog entry names a real exported callable', () => {
    const orphans = catalogNames.filter((name) => !exportedCallables.includes(name));
    expect(orphans).toEqual([]);
  });

  it('every description is well-formed (summary, params, return, ≥1 example)', () => {
    for (const name of catalogNames) {
      const d = catalog[name];
      expect(d.name, `${name}.name`).toBe(name);
      expect(d.summary.length, `${name}.summary`).toBeGreaterThan(0);
      expect(d.returns.length, `${name}.returns`).toBeGreaterThan(0);
      expect(d.examples.length, `${name}.examples`).toBeGreaterThanOrEqual(1);
      expect(d.examples.length, `${name}.examples`).toBeLessThanOrEqual(2);
      for (const p of d.params) {
        expect(p.name.length, `${name} param name`).toBeGreaterThan(0);
        expect(p.type.length, `${name} param type`).toBeGreaterThan(0);
        expect(p.doc.length, `${name} param doc`).toBeGreaterThan(0);
      }
    }
  });
});
