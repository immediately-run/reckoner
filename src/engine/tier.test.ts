import { describe, it, expect } from 'vitest';
import { meetTier, meetTiers, compareTier, isAutonomousMonotone } from './tier.ts';

describe('tier lattice', () => {
  it('meet takes the less-trusted tier', () => {
    expect(meetTier('static', 'live')).toBe('live');
    expect(meetTier('static', 'pulled')).toBe('pulled');
    expect(meetTier('pulled', 'live')).toBe('live');
    expect(meetTier('static', 'static')).toBe('static');
  });

  it('meetTiers folds a list; empty is static (a constant is clean)', () => {
    expect(meetTiers([])).toBe('static');
    expect(meetTiers(['static', 'static'])).toBe('static');
    expect(meetTiers(['static', 'pulled', 'live'])).toBe('live');
    expect(meetTiers(['static', 'pulled'])).toBe('pulled');
  });

  it('compareTier orders by trust', () => {
    expect(compareTier('live', 'static')).toBeLessThan(0);
    expect(compareTier('static', 'pulled')).toBeGreaterThan(0);
  });

  it('autonomous transitions may only drop or hold (F7)', () => {
    expect(isAutonomousMonotone('static', 'live')).toBe(true); // drop
    expect(isAutonomousMonotone('pulled', 'pulled')).toBe(true); // hold
    expect(isAutonomousMonotone('live', 'static')).toBe(false); // re-raise forbidden
  });
});
