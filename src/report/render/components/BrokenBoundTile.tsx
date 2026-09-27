// BrokenBoundTile — the one shared degraded-binding state (R3-788 review, R6): every bound
// component renders this when its binding cannot answer, so a future BindingStatus arm
// changes here, once, instead of drifting across per-component copies of the Kpi mapping
// (Kpi/Chart/Table/Facets/Gauge/GeoMap/Flow still carry their own; migrating them is its
// own item). `missing` reads as a needs-access affordance, `error` as a broken tile with
// the binding's message.
import type { BoundValue } from '../bindings.ts';
import BrokenTile from './BrokenTile.tsx';

export default function BrokenBoundTile({ component, bound }: { component: string; bound: BoundValue }) {
  return (
    <BrokenTile
      component={component}
      reason={bound.message ?? 'unavailable'}
      variant={bound.status === 'missing' ? 'needs-access' : 'error'}
    />
  );
}
