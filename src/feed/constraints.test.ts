import { describe, expect, it } from 'vitest';
import { checkBufferCoversWindows } from './constraints.ts';

describe('checkBufferCoversWindows', () => {
  it('passes when the buffer covers the window', () => {
    const v = checkBufferCoversWindows({ orders: { keepFor: '2h' } }, [{ feed: 'orders', window: '1h', site: 'sales.recent' }]);
    expect(v).toEqual([]);
  });

  it('errors when the window exceeds keepFor', () => {
    const v = checkBufferCoversWindows({ orders: { keepFor: '30m' } }, [{ feed: 'orders', window: '1h', site: 'sales.recent' }]);
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe('error');
    expect(v[0].message).toMatch(/exceeds feed "orders" retention/);
  });

  it('errors on a window over an unknown feed', () => {
    const v = checkBufferCoversWindows({}, [{ feed: 'ghost', window: '1h', site: 'x.y' }]);
    expect(v[0]).toMatchObject({ severity: 'error', feed: 'ghost' });
  });

  it('warns on a time window over a count-retained feed (can not be verified statically)', () => {
    const v = checkBufferCoversWindows({ orders: { keepLast: 100 } }, [{ feed: 'orders', window: '1h', site: 'sales.recent' }]);
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe('warning');
    expect(v[0].message).toMatch(/no keepFor/);
  });
});
