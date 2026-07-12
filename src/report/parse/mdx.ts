// A minimal MDX-subset → TemplateNode[] parser (§3.3, platform delta D3). This is the *dev*
// stand-in for the platform's no-acorn "render-as-data" safe renderer: it recognizes markdown
// prose and capitalized component tags, and — critically — it **never evaluates**. A tag
// becomes a node (name + attributes + children); an attribute is a literal (quoted string,
// `{…}` JS-literal, or bare boolean) or, for anything non-literal, an inert text capture
// (`f={fetch("/x")}` arrives as literal text). Markdown between tags is opaque prose.
//
// Known v1 limitation (deferred): an inline component interleaved with prose *within one line*
// (`Showing <Value … /> today.`) parses to separate block nodes rather than one inline flow;
// the block-level 90% (Kpi/Chart/Facets/Params/Section) is covered. The platform D3 renderer
// is the eventual home for full MDX inline handling.

import type { AttrValue, ComponentNode, TemplateNode } from '../nodes.ts';
import { inert, lit, markdown } from '../nodes.ts';
import { parseLiteral } from './literal.ts';

const NAME = /[A-Za-z][A-Za-z0-9]*/y;
const ATTR_NAME = /[A-Za-z][A-Za-z0-9-]*/y;

export function parseTemplate(src: string): TemplateNode[] {
  const s = new Scanner(src);
  return s.nodes(undefined);
}

class Scanner {
  #s: string;
  #i = 0;
  constructor(s: string) {
    this.#s = s;
  }

  /** Parse a run of nodes until `</closeName>` (or EOF when `closeName` is undefined). */
  nodes(closeName: string | undefined): TemplateNode[] {
    const out: TemplateNode[] = [];
    let text = '';
    const flush = (): void => {
      if (text.trim() !== '') out.push(markdown(text));
      text = '';
    };
    while (this.#i < this.#s.length) {
      const c = this.#s[this.#i];
      if (c === '<' && this.#isCloseTag()) {
        const name = this.#readCloseTag();
        flush();
        if (name === closeName) return out;
        // A mismatched/orphan close tag: ignore it and continue (robustness).
        continue;
      }
      if (c === '<' && this.#isOpenTag()) {
        flush();
        out.push(this.#component());
        continue;
      }
      text += c;
      this.#i++;
    }
    flush();
    return out;
  }

  #isOpenTag(): boolean {
    return this.#s[this.#i] === '<' && /[A-Z]/.test(this.#s[this.#i + 1] ?? '');
  }
  #isCloseTag(): boolean {
    return this.#s[this.#i] === '<' && this.#s[this.#i + 1] === '/' && /[A-Z]/.test(this.#s[this.#i + 2] ?? '');
  }
  #readCloseTag(): string {
    this.#i += 2; // '</'
    const name = this.#match(NAME) ?? '';
    this.#ws();
    if (this.#s[this.#i] === '>') this.#i++;
    return name;
  }

  #component(): ComponentNode {
    this.#i++; // '<'
    const name = this.#match(NAME) ?? '';
    const attrs: Record<string, AttrValue> = {};
    for (;;) {
      this.#ws();
      const c = this.#s[this.#i];
      if (c === undefined) break;
      if (c === '/' && this.#s[this.#i + 1] === '>') {
        this.#i += 2;
        return { type: 'component', name, attrs, children: [] };
      }
      if (c === '>') {
        this.#i++;
        const children = this.nodes(name);
        return { type: 'component', name, attrs, children };
      }
      const attrName = this.#match(ATTR_NAME);
      if (attrName === null) {
        this.#i++; // skip a stray char to guarantee progress
        continue;
      }
      attrs[attrName] = this.#attrValue();
    }
    return { type: 'component', name, attrs, children: [] };
  }

  #attrValue(): AttrValue {
    this.#ws();
    if (this.#s[this.#i] !== '=') return lit(true); // bare boolean attribute
    this.#i++; // '='
    this.#ws();
    const c = this.#s[this.#i];
    if (c === '"' || c === "'") return lit(this.#quoted(c));
    if (c === '{') {
      const inner = this.#braced();
      const parsed = parseLiteral(inner);
      return parsed.ok ? lit(parsed.value) : inert(inner.trim());
    }
    // Unbraced/unquoted value — capture as inert text until whitespace or tag end.
    let raw = '';
    while (this.#i < this.#s.length && !/[\s>/]/.test(this.#s[this.#i])) raw += this.#s[this.#i++];
    return inert(raw);
  }

  #quoted(quote: string): string {
    this.#i++; // opening quote
    let out = '';
    while (this.#i < this.#s.length) {
      const c = this.#s[this.#i++];
      if (c === '\\') {
        out += this.#s[this.#i++] ?? '';
      } else if (c === quote) {
        return out;
      } else {
        out += c;
      }
    }
    return out;
  }

  // Read a balanced `{…}` group, respecting quoted strings inside, and return the inner text.
  #braced(): string {
    this.#i++; // '{'
    let depth = 1;
    let out = '';
    while (this.#i < this.#s.length && depth > 0) {
      const c = this.#s[this.#i];
      if (c === '"' || c === "'") {
        out += this.#s[this.#i]; // opening quote
        this.#i++;
        while (this.#i < this.#s.length) {
          const q = this.#s[this.#i++];
          out += q;
          if (q === '\\') {
            out += this.#s[this.#i] ?? '';
            this.#i++;
          } else if (q === c) {
            break;
          }
        }
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          this.#i++;
          break;
        }
      }
      out += c;
      this.#i++;
    }
    return out;
  }

  #ws(): void {
    while (this.#i < this.#s.length && /\s/.test(this.#s[this.#i])) this.#i++;
  }
  #match(re: RegExp): string | null {
    re.lastIndex = this.#i;
    const m = re.exec(this.#s);
    if (m === null || m.index !== this.#i) return null;
    this.#i += m[0].length;
    return m[0];
  }
}
