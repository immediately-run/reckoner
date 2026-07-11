import { describe, it, expect } from 'vitest';
import { parseVersion, compareVersions, satisfies } from './semver.ts';

describe('parseVersion', () => {
  it('parses partial versions, defaulting minor/patch to 0', () => {
    expect(parseVersion('1')).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseVersion('1.4')).toEqual({ major: 1, minor: 4, patch: 0 });
    expect(parseVersion('1.4.2')).toEqual({ major: 1, minor: 4, patch: 2 });
  });

  it('throws on garbage', () => {
    expect(() => parseVersion('1.x')).toThrow();
    expect(() => parseVersion('')).toThrow();
    expect(() => parseVersion('^1.0.0')).toThrow();
  });
});

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('1.4.0', '1.4.0')).toBe(0);
    expect(compareVersions('1.3.9', '1.4.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.4.1', '1.4.0')).toBeGreaterThan(0);
  });
});

describe('satisfies — the compat range subset', () => {
  it('conjunction of comparators', () => {
    expect(satisfies('1.4.0', '>=1.4 <2')).toBe(true);
    expect(satisfies('1.9.9', '>=1.4 <2')).toBe(true);
    expect(satisfies('1.3.0', '>=1.4 <2')).toBe(false);
    expect(satisfies('2.0.0', '>=1.4 <2')).toBe(false);
  });

  it('exact and open ranges', () => {
    expect(satisfies('1.4.0', '=1.4.0')).toBe(true);
    expect(satisfies('1.4.1', '=1.4.0')).toBe(false);
    expect(satisfies('9.9.9', '')).toBe(true); // empty range: anything
  });
});
