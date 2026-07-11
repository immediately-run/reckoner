// The safe-render node model (ARCHITECTURE_PLAN §3.3, platform delta D3). A Reckoner
// template is authored in an MDX *subset* but renders through the host/SDK "render-as-data"
// safe renderer: a component tag is parsed to a **node** (name + attributes), never
// executed. This module models that node tree and the attribute-value distinction the
// grammar enforces — an attribute is either a **literal** (string/number/boolean/literal
// array or object) or an **inert** capture of anything non-literal (an expression body like
// `f={fetch("/x")}` arrives as literal text, never evaluated). Parsing MDX *into* this tree
// is the SDK safe renderer's job (D3); this repo owns the model + its validation.

import type { Value } from '../stdlib/types.ts';

/** A component attribute value: a captured literal, or inert (non-literal) text. */
export type AttrValue =
  | { kind: 'literal'; value: Value }
  | { kind: 'inert'; text: string };

export type TemplateNode = MarkdownNode | ComponentNode;

/** Opaque prose — rendered as markdown, never inspected for computation. */
export interface MarkdownNode {
  type: 'markdown';
  text: string;
}

/** A component tag parsed to data: a catalog name, literal-or-inert attributes, and children. */
export interface ComponentNode {
  type: 'component';
  name: string;
  attrs: Record<string, AttrValue>;
  children: TemplateNode[];
}

// --- small constructors (ergonomics for building/validating trees) ---------------

/** A literal attribute value. */
export function lit(value: Value): AttrValue {
  return { kind: 'literal', value };
}

/** An inert (non-literal / expression) attribute capture. */
export function inert(text: string): AttrValue {
  return { kind: 'inert', text };
}

export function markdown(text: string): MarkdownNode {
  return { type: 'markdown', text };
}

/**
 * Build a component node. `attrs` may pass raw literals (wrapped in `lit`) or explicit
 * {@link AttrValue}s (e.g. {@link inert}) for mixed cases.
 */
export function component(
  name: string,
  attrs: Record<string, Value | AttrValue> = {},
  children: TemplateNode[] = [],
): ComponentNode {
  const normalized: Record<string, AttrValue> = {};
  for (const [k, v] of Object.entries(attrs)) {
    normalized[k] = isAttrValue(v) ? v : lit(v);
  }
  return { type: 'component', name, attrs: normalized, children };
}

function isAttrValue(v: Value | AttrValue): v is AttrValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'kind' in v &&
    ((v as AttrValue).kind === 'literal' || (v as AttrValue).kind === 'inert')
  );
}
