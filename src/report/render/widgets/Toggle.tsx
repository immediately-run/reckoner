// Toggle widget — writes a boolean `params.<name>` (§3.3).
import type { ComponentNode } from '../../nodes.ts';
import { attrString, attrBool } from '../attrs.ts';
import { useParam } from './useParam.ts';

export default function Toggle({ node }: { node: ComponentNode }) {
  const name = attrString(node, 'name') ?? '';
  const def = attrBool(node, 'default');
  const { value, set } = useParam(name, def);
  const on = typeof value === 'boolean' ? value : def;
  return (
    <label className="rk-widget rk-widget-toggle">
      <span className="rk-widget-label">{name}</span>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
    </label>
  );
}
