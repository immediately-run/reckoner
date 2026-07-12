// Literal-attribute readers for the components (§3.3 "attribute values are literals only").
// Non-literal attributes were already captured as `inert` by the render-as-data path and are
// treated as absent here — a component never evaluates an expression. Pure helpers over a
// parsed `ComponentNode`; the validator (validate.ts) is what surfaces the authoring
// diagnostic, so these fall back silently rather than throwing at render time.

import type { Value } from '../../stdlib/types.ts';
import type { ComponentNode } from '../nodes.ts';

function literal(node: ComponentNode, name: string): Value | undefined {
  const a = node.attrs[name];
  return a !== undefined && a.kind === 'literal' ? a.value : undefined;
}

export function attrString(node: ComponentNode, name: string): string | undefined {
  const v = literal(node, name);
  return typeof v === 'string' ? v : undefined;
}

export function attrNumber(node: ComponentNode, name: string): number | undefined {
  const v = literal(node, name);
  return typeof v === 'number' ? v : undefined;
}

export function attrBool(node: ComponentNode, name: string): boolean {
  return literal(node, name) === true;
}

/** A literal array of scalars (e.g. Table `columns`, Select `options`). */
export function attrArray(node: ComponentNode, name: string): Value[] | undefined {
  const v = literal(node, name);
  return Array.isArray(v) ? v : undefined;
}

/** A literal array of strings, dropping non-strings (Table columns, Select options). */
export function attrStringArray(node: ComponentNode, name: string): string[] {
  const arr = attrArray(node, name);
  return arr === undefined ? [] : arr.filter((e): e is string => typeof e === 'string');
}
