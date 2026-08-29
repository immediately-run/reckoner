// The authoring vocabulary (DOCUMENT_NAVIGATOR_SPEC Part A) — the workbook panel's
// answer to "what components exist, and what can I use as an input knob?". Derived
// entirely from the closed catalog, so a catalog addition appears here for free and
// nothing can rot; panel chrome rather than a template component, so it costs the
// catalog nothing permanent, carries no document-compat implication, and needs no
// author to have placed a tag (spec §1, §9).
//
// The snippets are the load-bearing part: a copy button that yields red diagnostics
// teaches the reader that the catalog is broken, so §1.1 requires every generated
// snippet to PARSE AND VALIDATE with zero errors — which takes more than "the required
// attributes". Variants must carry their discriminator (the per-variant requirements
// only exist once `kind` is present), child rules must carry a valid child, and the
// Show* thresholds live outside the attribute schema entirely. G-DN-A3 runs every
// snippet through the real parser + validator, so an entry that stops satisfying this
// fails the suite rather than shipping a broken example.

import { WIDGETS, catalog, componentNames } from '../report/catalog.ts';
import type { AttrSchema, ComponentSchema } from '../report/catalog.ts';

export interface VocabAttribute {
  name: string;
  type: AttrSchema['type'];
  required: boolean;
  /** Allowed values for an enum attribute. */
  values?: readonly string[];
  /** The variant this attribute belongs to (absent = a base attribute). */
  variant?: string;
  doc?: string;
}

export interface VocabEntry {
  name: string;
  isWidget: boolean;
  isContainer: boolean;
  /** Base attributes plus every per-variant attribute, variant-labelled. */
  attributes: VocabAttribute[];
  /** The discriminator's allowed values, for a component with variants. */
  variantValues?: readonly string[];
  /** A copyable usage snippet that parses and validates, or null (with a reason). */
  snippet: string | null;
  snippetNote?: string;
}

export type VocabFilter = 'widgets' | 'components' | undefined;

/** One threshold is structurally required by these, outside their attribute schema. */
const SHOW_COMPONENTS: ReadonlySet<string> = new Set(['ShowAbove', 'ShowBelow']);

/** A minimal valid child for each declared child rule (spec §1.1). */
const CHILD_FOR_RULE: Record<string, string> = {
  'single-chart': '  <Chart source="worksheet.cell" kind="bar" x="column" y="column" />',
  widgets: '  <Range name="knob" min={0} max={10} />',
};

/** The literal text for one attribute value, or null for a bare boolean attribute. */
function placeholder(attr: AttrSchema): string | null {
  switch (attr.type) {
    case 'source':
      return '"worksheet.cell"';
    case 'field':
      return '"column"';
    case 'string':
      return '"text"';
    case 'number':
      return '{0}';
    case 'enum':
      return attr.values !== undefined && attr.values.length > 0 ? `"${attr.values[0]}"` : null;
    case 'literal-array':
      return '{["column"]}';
    case 'boolean':
      return null;
    default:
      return null;
  }
}

function renderAttr(attr: AttrSchema): string {
  const value = placeholder(attr);
  return value === null ? attr.name : `${attr.name}=${value}`;
}

/**
 * The attribute list a snippet must carry: every required base attribute, plus — for a
 * component with variants — the discriminator at its first value and that variant's
 * required attributes (they are not in `attributes`, and only become required once the
 * discriminator is present).
 */
function snippetAttrs(schema: ComponentSchema): string[] {
  const parts = schema.attributes.filter((a) => a.required === true).map(renderAttr);
  const variants = schema.variants;
  if (variants !== undefined) {
    const first = variants.values[0];
    if (first !== undefined) {
      parts.push(`${variants.discriminator}="${first}"`);
      for (const a of variants.byVariant[first] ?? []) {
        if (a.required === true) parts.push(renderAttr(a));
      }
    }
  }
  // The Show* thresholds are a structural rule (exactly one of width/height/dpr), not an
  // attribute requirement — an attribute-only recipe emits a tag that cannot validate.
  if (SHOW_COMPONENTS.has(schema.name)) parts.push('width={640}');
  return parts;
}

/** The snippet for one catalog entry (spec §1.1). */
export function snippetFor(schema: ComponentSchema): string {
  const attrs = snippetAttrs(schema);
  const open = [schema.name, ...attrs].join(' ');
  if (schema.container !== true) return `<${open} />`;
  const child = schema.childRule !== undefined ? CHILD_FOR_RULE[schema.childRule] : '  Prose.';
  return `<${open}>\n${child ?? '  Prose.'}\n</${schema.name}>`;
}

/** Every catalog entry's attributes, base first, then per-variant (variant-labelled). */
function attributesOf(schema: ComponentSchema): VocabAttribute[] {
  const base = schema.attributes.map((a) => ({
    name: a.name,
    type: a.type,
    required: a.required === true,
    values: a.values,
    doc: a.doc,
  }));
  const variants = schema.variants;
  if (variants === undefined) return base;
  const discriminator: VocabAttribute = {
    name: variants.discriminator,
    type: 'enum',
    required: true,
    values: variants.values,
  };
  const perVariant = variants.values.flatMap((v) =>
    (variants.byVariant[v] ?? []).map((a) => ({
      name: a.name,
      type: a.type,
      required: a.required === true,
      values: a.values,
      variant: v,
      doc: a.doc,
    })),
  );
  return [...base, discriminator, ...perVariant];
}

/**
 * The vocabulary, derived from the catalog (never a hand list — G-DN-A1). `filter`
 * narrows to the input widgets or to their complement; unset lists everything.
 */
export function vocabulary(filter: VocabFilter = undefined): VocabEntry[] {
  return componentNames
    .filter((name) => {
      if (filter === 'widgets') return WIDGETS.has(name);
      if (filter === 'components') return !WIDGETS.has(name);
      return true;
    })
    .map((name) => {
      const schema = catalog[name];
      return {
        name,
        isWidget: WIDGETS.has(name),
        isContainer: schema.container === true,
        attributes: attributesOf(schema),
        variantValues: schema.variants?.values,
        snippet: snippetFor(schema),
      };
    });
}
