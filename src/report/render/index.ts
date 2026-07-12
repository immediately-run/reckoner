// The report-view render surface (ARCHITECTURE_PLAN §3.3 shell A). `ReportView` walks a parsed
// `TemplateNode[]` and draws the audited catalog components, resolving every `source` binding
// through the injected `Bindings` port (value + tier). Shell B (`App.tsx`) supplies the port
// from the engine's results and the parser turns a template document into nodes.
//
// Deferred enrichments (noted, not papered over): a real polygon-geography Map (choropleth v1
// ships a region breakdown); Kpi `spark` (needs a series binding the v1 catalog doesn't carry);
// full CommonMark + inline-component-in-prose (the platform D3 renderer's remit); the
// host-drawn tier badge (we reserve the slot, §3.3 point 3 / review-1 H2).

export { default as ReportView } from './Renderer.tsx';
export type { Bindings, BoundValue, BindingStatus } from './bindings.ts';
export { missing } from './bindings.ts';
export { componentMap } from './componentMap.ts';
