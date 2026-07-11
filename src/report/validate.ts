// Validate a parsed template tree against the catalog, and collect its data bindings
// (ARCHITECTURE_PLAN §3.3). Two jobs, both load-bearing:
//
//   1. **Legibility of reads** — every `source` binding in the document is collected, so the
//      renderer knows the full set of names to subscribe to on the tiered result channel.
//      A template can only display what it statically names.
//   2. **Authoring diagnostics** — an unknown component becomes a safe placeholder (never a
//      page-killing error); a mis-typed/non-literal/missing attribute is a marked diagnostic.
//      Nothing here executes: non-literal attribute values were already captured as inert.
//
// The binding grammar is the formula language's dotted-name namespace, so bindings are
// validated with the stdlib's own `parseInput` (one grammar, not two).

import type { Value } from '../stdlib/types.ts';
import { parseInput } from '../stdlib/inputs.ts';
import { catalog, WIDGETS } from './catalog.ts';
import type { AttrSchema, ComponentSchema } from './catalog.ts';
import type { AttrValue, ComponentNode, TemplateNode } from './nodes.ts';

export interface TemplateDiagnostic {
  severity: 'error' | 'warning';
  component: string;
  message: string;
}

export interface TemplateValidation {
  diagnostics: TemplateDiagnostic[];
  /** Every distinct data binding the document reads, sorted. */
  bindings: string[];
  /** Unknown component names that will render as placeholders. */
  placeholders: string[];
}

export function validateTemplate(nodes: TemplateNode[]): TemplateValidation {
  const ctx: Ctx = { diagnostics: [], bindings: new Set(), placeholders: new Set() };
  walk(nodes, ctx);
  return {
    diagnostics: ctx.diagnostics,
    bindings: [...ctx.bindings].sort(),
    placeholders: [...ctx.placeholders].sort(),
  };
}

interface Ctx {
  diagnostics: TemplateDiagnostic[];
  bindings: Set<string>;
  placeholders: Set<string>;
}

function walk(nodes: TemplateNode[], ctx: Ctx, parent?: string): void {
  for (const node of nodes) {
    if (node.type === 'component') validateComponent(node, ctx, parent);
  }
}

function validateComponent(node: ComponentNode, ctx: Ctx, parent?: string): void {
  const schema = catalog[node.name];
  if (schema === undefined) {
    ctx.placeholders.add(node.name);
    ctx.diagnostics.push({
      severity: 'warning',
      component: node.name,
      message: `unknown component "${node.name}" — renders as a placeholder.`,
    });
    return; // the whole subtree is replaced by the placeholder; do not descend.
  }

  const effective = effectiveAttrs(node, schema, ctx);

  // A Chart directly inside a Facets inherits its source from the Facets binding, so its
  // own `source` is not required there.
  const sourceInherited = node.name === 'Chart' && parent === 'Facets';

  // Required attributes must be present as literals.
  for (const attr of effective) {
    if (attr.required === true && !(sourceInherited && attr.name === 'source')) {
      const v = node.attrs[attr.name];
      if (v === undefined || v.kind === 'inert') {
        ctx.diagnostics.push({ severity: 'error', component: node.name, message: `missing required attribute "${attr.name}".` });
      }
    }
  }

  // Each provided attribute must match a known schema and type.
  for (const [name, value] of Object.entries(node.attrs)) {
    const attr = effective.find((a) => a.name === name);
    if (attr === undefined) {
      ctx.diagnostics.push({ severity: 'warning', component: node.name, message: `unknown attribute "${name}".` });
      continue;
    }
    checkAttr(node.name, attr, value, ctx);
  }

  checkStructuralRules(node, schema, ctx);
  walk(node.children, ctx, node.name);
}

/** Base attributes plus, for a variant component, the discriminator + its variant's attributes. */
function effectiveAttrs(node: ComponentNode, schema: ComponentSchema, ctx: Ctx): AttrSchema[] {
  const attrs = [...schema.attributes];
  const variants = schema.variants;
  if (variants === undefined) return attrs;

  attrs.push({ name: variants.discriminator, type: 'enum', values: variants.values, required: true });
  const dv = node.attrs[variants.discriminator];
  if (dv !== undefined && dv.kind === 'literal' && typeof dv.value === 'string' && variants.values.includes(dv.value)) {
    attrs.push(...variants.byVariant[dv.value]);
  } else if (dv === undefined || dv.kind === 'inert' || !isKnownVariant(dv, variants.values)) {
    ctx.diagnostics.push({
      severity: 'error',
      component: node.name,
      message: `"${variants.discriminator}" must be one of ${variants.values.join(', ')}.`,
    });
  }
  return attrs;
}

function isKnownVariant(v: AttrValue, values: string[]): boolean {
  return v.kind === 'literal' && typeof v.value === 'string' && values.includes(v.value);
}

function checkAttr(component: string, attr: AttrSchema, value: AttrValue, ctx: Ctx): void {
  const err = (message: string): void => void ctx.diagnostics.push({ severity: 'error', component, message });

  if (value.kind === 'inert') {
    err(`attribute "${attr.name}" is not a literal (captured as inert: ${value.text}).`);
    return;
  }
  const v = value.value;

  switch (attr.type) {
    case 'source':
      if (typeof v !== 'string') return err(`"${attr.name}" must be a binding string.`);
      validateBinding(component, attr.name, v, ctx);
      return;
    case 'field':
    case 'string':
      if (typeof v !== 'string') err(`"${attr.name}" must be a string.`);
      return;
    case 'number':
      if (typeof v !== 'number') err(`"${attr.name}" must be a number.`);
      return;
    case 'boolean':
      if (typeof v !== 'boolean') err(`"${attr.name}" must be a boolean.`);
      return;
    case 'enum':
      if (typeof v !== 'string' || !(attr.values ?? []).includes(v)) {
        err(`"${attr.name}" must be one of ${(attr.values ?? []).join(', ')}.`);
      }
      return;
    case 'literal-array':
      if (!Array.isArray(v) || v.some((e) => !isScalar(e))) err(`"${attr.name}" must be a literal array of scalars.`);
      return;
  }
}

function validateBinding(component: string, attr: string, ref: string, ctx: Ctx): void {
  let spec;
  try {
    spec = parseInput(ref);
  } catch {
    ctx.diagnostics.push({ severity: 'error', component, message: `"${attr}" is not a valid binding: ${JSON.stringify(ref)}.` });
    return;
  }
  if (spec.wildcard) {
    ctx.diagnostics.push({ severity: 'error', component, message: `"${attr}" cannot bind a wildcard namespace; bind one cell.` });
    return;
  }
  ctx.bindings.add(ref);
}

function checkStructuralRules(node: ComponentNode, schema: ComponentSchema, ctx: Ctx): void {
  const childComponents = node.children.filter((c): c is ComponentNode => c.type === 'component');

  if (schema.childRule === 'widgets') {
    for (const child of childComponents) {
      if (!WIDGETS.has(child.name)) {
        ctx.diagnostics.push({ severity: 'error', component: node.name, message: `<Params> may only contain input widgets; found "${child.name}".` });
      }
    }
  } else if (schema.childRule === 'single-chart') {
    if (childComponents.length !== 1 || childComponents[0].name !== 'Chart') {
      ctx.diagnostics.push({ severity: 'error', component: node.name, message: `<Facets> must wrap exactly one <Chart>.` });
    }
  }

  if (node.name === 'ShowAbove' || node.name === 'ShowBelow') {
    const thresholds = ['width', 'height', 'dpr'].filter((t) => {
      const a = node.attrs[t];
      return a !== undefined && a.kind === 'literal';
    });
    if (thresholds.length !== 1) {
      ctx.diagnostics.push({ severity: 'error', component: node.name, message: `<${node.name}> needs exactly one threshold (width, height, or dpr).` });
    }
  }
}

function isScalar(v: Value): boolean {
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}
