import { describe, it, expect } from 'vitest';
import { parseInput, normalizeInputs, dependencies } from './inputs.ts';

describe('parseInput — reserved namespaces', () => {
  it('feeds / static / params / fixtures', () => {
    expect(parseInput('feeds.orders')).toMatchObject({
      namespace: 'feeds',
      segments: ['orders'],
      dependency: 'feeds.orders',
      wildcard: false,
    });
    expect(parseInput('static.fx_rates').dependency).toBe('static.fx_rates');
    expect(parseInput('params.region').dependency).toBe('params.region');
    expect(parseInput('fixtures.orders_holdout').namespace).toBe('fixtures');
  });

  it('deep path into a feed keeps the feed as the dependency', () => {
    const s = parseInput('feeds.orders.meta.fetched_at');
    expect(s.namespace).toBe('feeds');
    expect(s.segments).toEqual(['orders', 'meta', 'fetched_at']);
    expect(s.dependency).toBe('feeds.orders');
  });
});

describe('parseInput — worksheet references', () => {
  it('a single cell reference', () => {
    expect(parseInput('revenue.by_month')).toMatchObject({
      namespace: 'worksheet',
      worksheet: 'revenue',
      cell: 'by_month',
      wildcard: false,
      dependency: 'revenue.by_month',
    });
  });

  it('a declared-namespace wildcard', () => {
    expect(parseInput('revenue.*')).toMatchObject({
      namespace: 'worksheet',
      worksheet: 'revenue',
      wildcard: true,
      dependency: 'revenue.*',
    });
  });

  it('rejects a multi-segment worksheet reference', () => {
    expect(() => parseInput('revenue.by_month.extra')).toThrow();
  });
});

describe('parseInput — windowed feed object form', () => {
  it('carries the window and resolves to the feed dependency', () => {
    expect(parseInput({ feed: 'orders', window: '1h' })).toMatchObject({
      namespace: 'feeds',
      feed: 'orders',
      window: '1h',
      dependency: 'feeds.orders',
    });
  });
});

describe('parseInput — errors', () => {
  it('rejects empty / malformed paths', () => {
    expect(() => parseInput('')).toThrow();
    expect(() => parseInput('feeds')).toThrow(); // no name
    expect(() => parseInput('feeds.')).toThrow();
    expect(() => parseInput('feeds.*')).toThrow(); // cannot wildcard a reserved namespace
  });
});

describe('normalizeInputs / dependencies', () => {
  it('normalizes a map and dedupes the coarse dependency set', () => {
    const inputs = {
      orders: 'feeds.orders',
      fx: 'static.fx_rates',
      region: 'params.region',
      also_orders: 'feeds.orders', // duplicate dependency
    };
    expect(Object.keys(normalizeInputs(inputs))).toEqual(['orders', 'fx', 'region', 'also_orders']);
    expect(dependencies(inputs)).toEqual(['feeds.orders', 'static.fx_rates', 'params.region']);
  });
});
