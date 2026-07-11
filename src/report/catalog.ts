// The closed v1 component catalog (ARCHITECTURE_PLAN §3.3, RQ-F1). Typed attributes with
// enums for closed choices; responsive reflow, theming, and accessible color live *in* the
// components, not in author attributes. The catalog is closed by construction — an unknown
// component renders as a safe placeholder (the fork story: fork components degrade
// gracefully in stock Reckoner) — and anti-affordances (3D, dual-axis, pies > 5 slices,
// word clouds) are simply inexpressible: there is no attribute for them.
//
// Attribute kinds:
//   - `source` — a data binding (`worksheet.cell`, `params.*`, or a feed). The renderer
//     subscribes to every `source` in the document; a template can only display what it names.
//   - `field`  — a column name *within* the bound rows (x/y/color/value/…), a literal string.
//   - `enum`   — a closed choice.
//   - `string` / `number` / `boolean` / `literal-array` — plain literals.

export type AttrType = 'source' | 'field' | 'string' | 'number' | 'boolean' | 'enum' | 'literal-array';

export interface AttrSchema {
  name: string;
  type: AttrType;
  required?: boolean;
  /** Allowed values for `type: 'enum'`. */
  values?: string[];
  doc?: string;
}

export interface Variants {
  /** The attribute whose value selects the variant (e.g. `kind`). */
  discriminator: string;
  values: string[];
  /** Additional attributes per variant value. */
  byVariant: Record<string, AttrSchema[]>;
}

export interface ComponentSchema {
  name: string;
  /** Whether the component may contain children. */
  container?: boolean;
  /** Base attributes present for every variant. */
  attributes: AttrSchema[];
  variants?: Variants;
  /** A structural rule on children, validated by ./validate.ts. */
  childRule?: 'widgets' | 'single-chart';
}

const source = (name: string, required = true): AttrSchema => ({ name, type: 'source', required });
const field = (name: string, required = false): AttrSchema => ({ name, type: 'field', required });

const CHART: ComponentSchema = {
  name: 'Chart',
  attributes: [source('source')],
  variants: {
    discriminator: 'kind',
    values: ['bar', 'line', 'area', 'scatter', 'histogram', 'pie'],
    byVariant: {
      bar: [field('x', true), field('y', true), field('color'), { name: 'stack', type: 'enum', values: ['none', 'stacked', 'normalized'] }],
      line: [field('x', true), field('y', true), field('color')],
      area: [field('x', true), field('y', true), field('color')],
      scatter: [field('x', true), field('y', true), field('color'), field('size')],
      histogram: [field('value', true), { name: 'bins', type: 'number' }],
      pie: [field('value', true), field('label', true)], // ≤5 slices enforced at render (data rule)
    },
  },
};

const MAP: ComponentSchema = {
  name: 'Map',
  attributes: [source('source')],
  variants: {
    discriminator: 'kind',
    values: ['choropleth', 'point'],
    byVariant: {
      choropleth: [field('region', true), field('value', true)],
      point: [field('lat', true), field('lon', true), field('value')],
    },
  },
};

const SHOW_ATTRS: AttrSchema[] = [
  { name: 'width', type: 'number' },
  { name: 'height', type: 'number' },
  { name: 'dpr', type: 'number' },
];

const COMPONENTS: ComponentSchema[] = [
  {
    name: 'Kpi',
    attributes: [
      source('source'),
      source('compare', false),
      { name: 'format', type: 'enum', values: ['number', 'currency', 'percent'] },
      { name: 'spark', type: 'boolean' },
    ],
  },
  CHART,
  {
    name: 'Table',
    attributes: [source('source'), { name: 'columns', type: 'literal-array', required: true }, { name: 'sortable', type: 'boolean' }],
  },
  MAP,
  { name: 'Facets', container: true, childRule: 'single-chart', attributes: [source('source'), field('by', true)] },
  { name: 'Callout', container: true, attributes: [{ name: 'tone', type: 'enum', values: ['info', 'success', 'warning', 'danger'] }] },
  { name: 'Value', attributes: [source('source')] },
  {
    name: 'Gauge',
    attributes: [source('source'), { name: 'min', type: 'number' }, { name: 'max', type: 'number' }, { name: 'format', type: 'enum', values: ['number', 'currency', 'percent'] }],
  },
  { name: 'Section', container: true, attributes: [] },
  { name: 'Row', container: true, attributes: [] },
  { name: 'ShowAbove', container: true, attributes: SHOW_ATTRS },
  { name: 'ShowBelow', container: true, attributes: SHOW_ATTRS },
  { name: 'Params', container: true, childRule: 'widgets', attributes: [] },
  { name: 'Select', attributes: [{ name: 'name', type: 'string', required: true }, { name: 'options', type: 'literal-array', required: true }, { name: 'default', type: 'string' }] },
  { name: 'Toggle', attributes: [{ name: 'name', type: 'string', required: true }, { name: 'default', type: 'boolean' }] },
  { name: 'Range', attributes: [{ name: 'name', type: 'string', required: true }, { name: 'min', type: 'number', required: true }, { name: 'max', type: 'number', required: true }, { name: 'step', type: 'number' }, { name: 'default', type: 'number' }] },
  { name: 'DateRange', attributes: [{ name: 'name', type: 'string', required: true }, { name: 'default', type: 'string' }] },
];

/** The widget components a `<Params>` block may contain. */
export const WIDGETS: ReadonlySet<string> = new Set(['Select', 'Toggle', 'Range', 'DateRange']);

/** The catalog, keyed by component name. */
export const catalog: Record<string, ComponentSchema> = Object.freeze(
  Object.fromEntries(COMPONENTS.map((c) => [c.name, c])),
);

/** All component names in the catalog. */
export const componentNames: string[] = COMPONENTS.map((c) => c.name);
