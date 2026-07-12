// Row — a horizontal layout grouping (§3.3 layout primitives) that reflows to a fluid grid so
// tiles add/drop columns continuously with space (§3.3.1 intrinsic layout). Container; the
// responsiveness is entirely in CSS — the template carries no breakpoints.
import type { ComponentNode } from '../../nodes.ts';
import { useRenderNodes } from '../renderContext.ts';

export default function Row({ node }: { node: ComponentNode }) {
  const renderNodes = useRenderNodes();
  return <div className="rk-row">{renderNodes(node.children)}</div>;
}
