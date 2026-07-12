// The report renderer (§3.3) — the single recursive dispatcher that walks a parsed
// `TemplateNode[]` and draws it: markdown → prose, a component tag → its audited catalog
// component (looked up by name), an unknown tag → a safe placeholder. It provides the two
// contexts the tree reads: the injected `Bindings` data port and the child-render callback
// (so container components render their children without importing this module). The renderer
// itself is thin wiring — all behavior lives in the components and the pure helpers.
import type { ReactNode } from 'react';
import type { Bindings } from './bindings.ts';
import type { TemplateNode } from '../nodes.ts';
import { BindingsContext } from './bindingsContext.ts';
import { RenderContext } from './renderContext.ts';
import { componentMap } from './componentMap.ts';
import Markdown from './components/Markdown.tsx';
import Placeholder from './components/Placeholder.tsx';
import './report.css';

function renderNode(node: TemplateNode, key: number): ReactNode {
  if (node.type === 'markdown') return <Markdown key={key} text={node.text} />;
  const Comp = componentMap[node.name];
  if (Comp === undefined) return <Placeholder key={key} name={node.name} />;
  return <Comp key={key} node={node} />;
}

function renderNodes(nodes: TemplateNode[]): ReactNode {
  return nodes.map((node, i) => renderNode(node, i));
}

export default function ReportView({ nodes, bindings }: { nodes: TemplateNode[]; bindings: Bindings }) {
  return (
    <BindingsContext.Provider value={bindings}>
      <RenderContext.Provider value={renderNodes}>
        <div className="rk-report">{renderNodes(nodes)}</div>
      </RenderContext.Provider>
    </BindingsContext.Provider>
  );
}
