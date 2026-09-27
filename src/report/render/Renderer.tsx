// The report renderer (§3.3) — the single recursive dispatcher that walks a parsed
// `TemplateNode[]` and draws it: markdown → prose, a component tag → its audited catalog
// component (looked up by name), an unknown tag → a safe placeholder. It provides the two
// contexts the tree reads: the injected `Bindings` data port and the child-render callback
// (so container components render their children without importing this module). The
// renderer itself is thin wiring — all behavior lives in the components and the pure helpers.
//
// V3's on-pixel affordance rides here too: a component node carrying a literal primary
// binding — its `source`, or for a component without one (Flow: `nodes`/`edges`) its first
// source-typed catalog attribute — is wrapped once in `Inspectable`,
// which offers hover/long-press inspection when (and only when) `ReportView` receives an
// inspection port — run mode without it renders exactly as before.
import type { ReactNode } from 'react';
import type { Bindings } from './bindings.ts';
import type { ComponentNode, TemplateNode } from '../nodes.ts';
import { catalog } from '../catalog.ts';
import { BindingsContext } from './bindingsContext.ts';
import { InspectionContext } from './inspectionContext.ts';
import type { InspectionPort } from './inspectionContext.ts';
import { ReflectionContext } from './reflectionContext.ts';
import type { ReflectionPort } from './reflectionContext.ts';
import { RenderContext } from './renderContext.ts';
import { componentMap } from './componentMap.ts';
import Inspectable from './Inspectable.tsx';
import Markdown from './components/Markdown.tsx';
import Placeholder from './components/Placeholder.tsx';
import './report.css';
import './flow.css';

/**
 * The binding the inspection affordance targets: `source` (Chart-in-Facets has none and stays
 * bare), or — for a component whose schema has no `source` — its first source-typed attribute.
 */
function primaryBinding(node: ComponentNode): string | undefined {
  const sources = (catalog[node.name]?.attributes ?? []).filter((a) => a.type === 'source').map((a) => a.name);
  const name = sources.length === 0 || sources.includes('source') ? 'source' : sources[0];
  const v = node.attrs[name];
  return v?.kind === 'literal' && typeof v.value === 'string' ? v.value : undefined;
}

function renderNode(node: TemplateNode, key: number): ReactNode {
  if (node.type === 'markdown') return <Markdown key={key} text={node.text} />;
  const Comp = componentMap[node.name];
  if (Comp === undefined) return <Placeholder key={key} name={node.name} />;
  const drawn = <Comp key={key} node={node} />;
  const source = primaryBinding(node);
  if (source !== undefined) {
    return (
      <Inspectable key={key} source={source}>
        {drawn}
      </Inspectable>
    );
  }
  return drawn;
}

function renderNodes(nodes: TemplateNode[]): ReactNode {
  return nodes.map((node, i) => renderNode(node, i));
}

interface ReportViewProps {
  nodes: TemplateNode[];
  bindings: Bindings;
  /** The V3 inspection port — absent in plain run mode (no affordance rendered). */
  inspection?: InspectionPort;
  /**
   * The reflection port (AUTHORS_VIEW_SPEC §3/§6) — provided ONLY for the author's-view
   * render. Withholding it everywhere else is what makes "reflection components render
   * only in the author's view" structural: without it they degrade to the broken tile.
   */
  reflection?: ReflectionPort;
}

export default function ReportView({ nodes, bindings, inspection, reflection }: ReportViewProps) {
  return (
    <BindingsContext.Provider value={bindings}>
      <RenderContext.Provider value={renderNodes}>
        <InspectionContext.Provider value={inspection ?? null}>
          <ReflectionContext.Provider value={reflection ?? null}>
            <div className="rk-report">{renderNodes(nodes)}</div>
          </ReflectionContext.Provider>
        </InspectionContext.Provider>
      </RenderContext.Provider>
    </BindingsContext.Provider>
  );
}
