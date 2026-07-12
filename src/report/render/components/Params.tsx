// Params — a block of input widgets (§3.3 "widgets write to input cells"). Container; renders
// its widget children (Select/Toggle/Range/DateRange) through the shared dispatcher. A widget's
// `name` designates a `params.*` input cell: a viewer pick writes the param, the host
// recomputes every formula that declared it, and every bound component re-renders. Interaction
// is pure data flow the dependency graph already understands — no event handlers in templates.
import type { ComponentNode } from '../../nodes.ts';
import { useRenderNodes } from '../renderContext.ts';

export default function Params({ node }: { node: ComponentNode }) {
  const renderNodes = useRenderNodes();
  return (
    <form className="rk-params" role="group" aria-label="report parameters" onSubmit={(e) => e.preventDefault()}>
      {renderNodes(node.children)}
    </form>
  );
}
