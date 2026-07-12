import { describe, expect, it } from 'vitest';
import { parseLiteral } from './literal.ts';

describe('parseLiteral', () => {
  it('parses scalars', () => {
    expect(parseLiteral('5')).toEqual({ ok: true, value: 5 });
    expect(parseLiteral('-3.5e2')).toEqual({ ok: true, value: -350 });
    expect(parseLiteral('true')).toEqual({ ok: true, value: true });
    expect(parseLiteral('false')).toEqual({ ok: true, value: false });
    expect(parseLiteral('null')).toEqual({ ok: true, value: null });
    expect(parseLiteral('"hi"')).toEqual({ ok: true, value: 'hi' });
    expect(parseLiteral("'hi'")).toEqual({ ok: true, value: 'hi' });
  });

  it('parses arrays and objects of literals', () => {
    expect(parseLiteral('["all", "emea", "amer"]')).toEqual({ ok: true, value: ['all', 'emea', 'amer'] });
    expect(parseLiteral('[1, 2, 3]')).toEqual({ ok: true, value: [1, 2, 3] });
    expect(parseLiteral('{ a: 1, "b": "x", c: [true, null] }')).toEqual({ ok: true, value: { a: 1, b: 'x', c: [true, null] } });
    expect(parseLiteral('[]')).toEqual({ ok: true, value: [] });
    expect(parseLiteral('{}')).toEqual({ ok: true, value: {} });
  });

  it('handles string escapes', () => {
    expect(parseLiteral('"a\\"b"')).toEqual({ ok: true, value: 'a"b' });
    expect(parseLiteral('"line\\nbreak"')).toEqual({ ok: true, value: 'line\nbreak' });
  });

  it('rejects any non-literal (never evaluates)', () => {
    expect(parseLiteral('fetch("/x")').ok).toBe(false);
    expect(parseLiteral('a + b').ok).toBe(false);
    expect(parseLiteral('() => 1').ok).toBe(false);
    expect(parseLiteral('trueish').ok).toBe(false);
    expect(parseLiteral('window').ok).toBe(false);
    expect(parseLiteral('[1, foo]').ok).toBe(false);
  });

  it('rejects trailing garbage after a valid literal', () => {
    expect(parseLiteral('5 6').ok).toBe(false);
    expect(parseLiteral('"x" y').ok).toBe(false);
  });
});
