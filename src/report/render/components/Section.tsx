// Section — a vertical layout grouping (§3.3 layout primitives). Container; renders children
// stacked. Responsive spacing lives in CSS, not the template.
import type { ComponentNode } from '../../nodes.ts';
import { useRenderNodes } from '../renderContext.ts';

export default function Section({ node }: { node: ComponentNode }) {
  const renderNodes = useRenderNodes();
  return <section className="rk-section">{renderNodes(node.children)}</section>;
}
