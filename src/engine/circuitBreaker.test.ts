import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuitBreaker.ts';

describe('CircuitBreaker', () => {
  it('quarantines a cell after hardLimit terminations within the window', () => {
    const cb = new CircuitBreaker({ hardLimit: 3, windowMs: 1000, softSuppressMs: 100 });
    expect(cb.hardTermination('a', 0)).toBe(false);
    expect(cb.hardTermination('a', 100)).toBe(false);
    expect(cb.isBlocked('a', 100)).toBe(false);
    expect(cb.hardTermination('a', 200)).toBe(true); // 3rd within window → quarantined
    expect(cb.isBlocked('a', 200)).toBe(true);
    expect(cb.quarantined()).toEqual(['a']);
  });

  it('ages hard terminations out of the window (regardless of input)', () => {
    const cb = new CircuitBreaker({ hardLimit: 2, windowMs: 1000, softSuppressMs: 100 });
    cb.hardTermination('a', 0);
    cb.hardTermination('a', 2000); // first aged out → count resets to 1
    expect(cb.isBlocked('a', 2000)).toBe(false);
    expect(cb.hardTermination('a', 2100)).toBe(true); // now 2 within window
  });

  it('re-arms a quarantined cell', () => {
    const cb = new CircuitBreaker({ hardLimit: 1, windowMs: 1000, softSuppressMs: 100 });
    cb.hardTermination('a', 0);
    expect(cb.isBlocked('a', 0)).toBe(true);
    cb.rearm('a');
    expect(cb.isBlocked('a', 0)).toBe(false);
    expect(cb.quarantined()).toEqual([]);
  });

  it('soft-suppresses only a confirmed timeout, and it decays (never permanent)', () => {
    const cb = new CircuitBreaker({ hardLimit: 3, windowMs: 1000, softSuppressMs: 100 });
    cb.softTimeout('a', 0, false); // unconfirmed → ignored
    expect(cb.isBlocked('a', 0)).toBe(false);
    cb.softTimeout('a', 0, true); // confirmed → suppressed for 100ms
    expect(cb.isBlocked('a', 50)).toBe(true);
    expect(cb.isBlocked('a', 150)).toBe(false); // decayed
    expect(cb.quarantined()).toEqual([]); // soft never quarantines
  });
});
