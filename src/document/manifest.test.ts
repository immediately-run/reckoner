import { describe, it, expect } from 'vitest';
import { parseManifest } from './manifest.ts';

const valid = {
  format: 1,
  compat: { stdlib: '>=1.0 <2', catalog: '>=1.0 <2', tierTag: 1 },
  authoredWith: { app: 'reckoner@1.4.2', stdlib: '1.4.0', catalog: '1.2.1' },
  worksheets: ['revenue.sheet.js', 'churn.sheet.js'],
  params: { region: 'all', period: 'last-90d' },
  title: 'Weekly revenue',
};

describe('parseManifest — valid', () => {
  it('parses the full manifest', () => {
    const m = parseManifest(valid);
    expect(m.format).toBe(1);
    expect(m.compat.stdlib).toBe('>=1.0 <2');
    expect(m.worksheets).toEqual(['revenue.sheet.js', 'churn.sheet.js']);
    expect(m.params.region).toBe('all');
    expect(m.authoredWith?.app).toBe('reckoner@1.4.2');
  });

  it('defaults compat and params when omitted', () => {
    const m = parseManifest({ format: 1, worksheets: [] });
    expect(m.compat).toEqual({});
    expect(m.params).toEqual({});
  });
});

describe('parseManifest — rejects', () => {
  it('a missing or non-integer format', () => {
    expect(() => parseManifest({ worksheets: [] })).toThrow(/format/);
    expect(() => parseManifest({ format: 1.5, worksheets: [] })).toThrow(/format/);
    expect(() => parseManifest({ format: 0, worksheets: [] })).toThrow(/format/);
  });

  it('a non-array worksheets or non-string entries', () => {
    expect(() => parseManifest({ format: 1, worksheets: 'revenue' })).toThrow(/worksheets/);
    expect(() => parseManifest({ format: 1, worksheets: ['ok', 42] })).toThrow(/worksheets/);
  });

  it('an invalid compat range', () => {
    expect(() => parseManifest({ format: 1, worksheets: [], compat: { stdlib: 'latest' } })).toThrow(/semver range/);
  });

  it('a non-object manifest', () => {
    expect(() => parseManifest(null)).toThrow();
    expect(() => parseManifest([])).toThrow();
  });
});
