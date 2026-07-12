// DateRange widget — writes a string `params.<name>` naming a relative range preset (§3.3).
// v1 offers a closed preset list resolvable by the stdlib's `resolveRange(preset, now)`; a
// custom calendar picker is a deferred enrichment. The declared preset set is the validation.
import type { ComponentNode } from '../../nodes.ts';
import { attrString } from '../attrs.ts';
import { useParam } from './useParam.ts';

const PRESETS = ['last-30d', 'last-90d', 'last-12m', 'ytd', 'all'];

export default function DateRange({ node }: { node: ComponentNode }) {
  const name = attrString(node, 'name') ?? '';
  const def = attrString(node, 'default') ?? 'last-90d';
  const options = PRESETS.includes(def) ? PRESETS : [def, ...PRESETS];
  const { value, set } = useParam(name, def);
  const current = typeof value === 'string' ? value : def;
  return (
    <label className="rk-widget rk-widget-daterange">
      <span className="rk-widget-label">{name}</span>
      <select value={current} onChange={(e) => set(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
