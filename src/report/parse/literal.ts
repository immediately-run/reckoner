// A safe literal parser for MDX braced attribute values (§3.3: "attribute values are literals
// only … anything non-literal is inert text"). This NEVER evaluates — it is a hand-written
// recursive-descent reader over the JS-literal subset (numbers, true/false/null, single- or
// double-quoted strings, arrays, and plain objects of literals). If the whole input is a
// literal it returns the value; otherwise the caller keeps the raw text as an inert capture
// (so `f={fetch("/x")}` is data, never code). Pure.

import type { Value } from '../../stdlib/types.ts';

export type LiteralResult = { ok: true; value: Value } | { ok: false };

export function parseLiteral(text: string): LiteralResult {
  const p = new Reader(text);
  p.ws();
  let value: Value;
  try {
    value = p.value();
  } catch {
    return { ok: false };
  }
  p.ws();
  return p.done() ? { ok: true, value } : { ok: false };
}

class Reader {
  #s: string;
  #i = 0;
  constructor(s: string) {
    this.#s = s;
  }
  done(): boolean {
    return this.#i >= this.#s.length;
  }
  ws(): void {
    while (this.#i < this.#s.length && /\s/.test(this.#s[this.#i])) this.#i++;
  }
  #peek(): string {
    return this.#s[this.#i];
  }
  value(): Value {
    this.ws();
    const c = this.#peek();
    if (c === '{') return this.#object();
    if (c === '[') return this.#array();
    if (c === '"' || c === "'") return this.#string(c);
    if (c === '-' || (c >= '0' && c <= '9')) return this.#number();
    if (this.#s.startsWith('true', this.#i)) return this.#lit('true', true);
    if (this.#s.startsWith('false', this.#i)) return this.#lit('false', false);
    if (this.#s.startsWith('null', this.#i)) return this.#lit('null', null);
    throw new Error('unexpected token');
  }
  #lit<T extends Value>(word: string, val: T): T {
    // Guard against a longer identifier (e.g. `trueish`) — the next char must not be word-ish.
    const after = this.#s[this.#i + word.length];
    if (after !== undefined && /[A-Za-z0-9_]/.test(after)) throw new Error('bad literal');
    this.#i += word.length;
    return val;
  }
  #number(): number {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.#s.slice(this.#i));
    if (m === null) throw new Error('bad number');
    this.#i += m[0].length;
    return Number(m[0]);
  }
  #string(quote: string): string {
    this.#i++; // opening quote
    let out = '';
    while (this.#i < this.#s.length) {
      const c = this.#s[this.#i++];
      if (c === '\\') {
        const e = this.#s[this.#i++];
        out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
      } else if (c === quote) {
        return out;
      } else {
        out += c;
      }
    }
    throw new Error('unterminated string');
  }
  #array(): Value[] {
    this.#i++; // [
    const out: Value[] = [];
    this.ws();
    if (this.#peek() === ']') {
      this.#i++;
      return out;
    }
    for (;;) {
      out.push(this.value());
      this.ws();
      const c = this.#s[this.#i++];
      if (c === ']') return out;
      if (c !== ',') throw new Error('expected , or ]');
    }
  }
  #object(): { [key: string]: Value } {
    this.#i++; // {
    const out: { [key: string]: Value } = {};
    this.ws();
    if (this.#peek() === '}') {
      this.#i++;
      return out;
    }
    for (;;) {
      this.ws();
      const key = this.#key();
      this.ws();
      if (this.#s[this.#i++] !== ':') throw new Error('expected :');
      out[key] = this.value();
      this.ws();
      const c = this.#s[this.#i++];
      if (c === '}') return out;
      if (c !== ',') throw new Error('expected , or }');
    }
  }
  #key(): string {
    const c = this.#peek();
    if (c === '"' || c === "'") return this.#string(c);
    const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(this.#s.slice(this.#i));
    if (m === null) throw new Error('bad key');
    this.#i += m[0].length;
    return m[0];
  }
}
