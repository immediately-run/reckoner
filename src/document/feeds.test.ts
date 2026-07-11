import { describe, it, expect } from 'vitest';
import { parseFeedConfig } from './feeds.ts';

describe('parseFeedConfig — valid', () => {
  it('a polling feed with a secret reference and retention', () => {
    const c = parseFeedConfig({
      source: 'https://api.example.com/orders',
      mode: 'poll',
      schedule: '*/5 * * * *',
      auth: { secretRef: 'secrets/orders-api-key' },
      retention: { keepLast: 500, keepFor: '30d' },
      conflation: '1s',
    });
    expect(c.mode).toBe('poll');
    expect(c.auth?.secretRef).toBe('secrets/orders-api-key');
    expect(c.retention).toEqual({ keepLast: 500, keepFor: '30d' });
  });

  it('a subscribe feed with multiple sources and no auth', () => {
    const c = parseFeedConfig({ source: ['wss://a', 'wss://b'], mode: 'subscribe' });
    expect(c.source).toEqual(['wss://a', 'wss://b']);
    expect(c.auth).toBeUndefined();
  });
});

describe('parseFeedConfig — rejects', () => {
  it('an inline secret value (must be a secretRef)', () => {
    expect(() =>
      parseFeedConfig({ source: 'https://x', mode: 'poll', auth: { token: 'sk-live-123' } }),
    ).toThrow(/inline secret/);
    expect(() =>
      parseFeedConfig({ source: 'https://x', mode: 'poll', auth: { apiKey: 'abc' } }),
    ).toThrow(/inline secret/);
  });

  it('a missing/empty source or bad mode', () => {
    expect(() => parseFeedConfig({ mode: 'poll' })).toThrow(/source/);
    expect(() => parseFeedConfig({ source: [], mode: 'poll' })).toThrow(/source/);
    expect(() => parseFeedConfig({ source: 'https://x', mode: 'stream' })).toThrow(/mode/);
  });

  it('an auth block without a secretRef', () => {
    expect(() => parseFeedConfig({ source: 'https://x', mode: 'poll', auth: {} })).toThrow(/secretRef/);
  });
});
