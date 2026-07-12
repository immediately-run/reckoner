// The report-view template layer (ARCHITECTURE_PLAN §3.3) — the closed component catalog,
// the render-as-data node model, and the validator/binding-collector. This is the pure,
// data-side contract that sits ahead of the SDK "render-as-data" safe renderer (platform
// delta D3): the renderer parses MDX into these nodes and draws the audited components; this
// repo owns which components exist, what attributes they take, and how a template is checked.
//
// Not here (other realms / deferred): the MDX → node parser (the SDK safe renderer, D3), the
// React implementations of the components (with their responsive/themed/accessible internals,
// §3.3.1), host-rendered tier badges (§3.3 point 3), and data-shape contracts that need the
// resolved cell value at render time (a Kpi wants a scalar, a Chart wants rows).

export type { AttrValue, ComponentNode, MarkdownNode, TemplateNode } from './nodes.ts';
export { component, inert, lit, markdown } from './nodes.ts';

export { catalog, componentNames, WIDGETS } from './catalog.ts';
export type { AttrSchema, AttrType, ComponentSchema, Variants } from './catalog.ts';

export { validateTemplate } from './validate.ts';
export type { TemplateDiagnostic, TemplateValidation } from './validate.ts';

// The MDX-subset parser (dev stand-in for the platform D3 safe renderer) turns a template
// document into the node model above.
export { parseTemplate } from './parse/mdx.ts';

// The React render surface (shell A): draws a parsed template against engine results via the
// injected Bindings port. See ./render/index.ts for the deferred-enrichment notes.
export { ReportView } from './render/index.ts';
export type { Bindings, BoundValue, BindingStatus } from './render/index.ts';
export { missing } from './render/index.ts';
