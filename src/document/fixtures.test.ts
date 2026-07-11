import { describe, it, expect } from 'vitest';
import { parseFixtureFrame } from './fixtures.ts';

describe('parseFixtureFrame', () => {
  it('parses rows, provenance, and the advisory tier tag', () => {
    const f = parseFixtureFrame({
      rows: [
        { month: '2026-06', revenue: 48_120 },
        { month: '2026-05', revenue: 47_010 },
      ],
      provenance: { sourceFeed: 'orders', capturedAt: '2026-07-01T00:00:00Z', captureActor: 'peter' },
      tier: 'M2',
    });
    expect(f.rows).toHaveLength(2);
    expect(f.provenance.sourceFeed).toBe('orders');
    expect(f.tier).toBe('M2');
  });

  it('marks a synthetic fixture', () => {
    const f = parseFixtureFrame({ rows: [{ x: 1 }], provenance: { synthetic: true } });
    expect(f.provenance.synthetic).toBe(true);
  });

  it('provenance defaults to empty when omitted', () => {
    expect(parseFixtureFrame({ rows: [] }).provenance).toEqual({});
  });

  it('rejects non-array rows or non-object rows', () => {
    expect(() => parseFixtureFrame({ rows: 'nope' })).toThrow(/rows/);
    expect(() => parseFixtureFrame({ rows: [1, 2, 3] })).toThrow(/rows/);
  });

  it('rejects a non-boolean synthetic flag', () => {
    expect(() => parseFixtureFrame({ rows: [], provenance: { synthetic: 'yes' } })).toThrow(/synthetic/);
  });
});
