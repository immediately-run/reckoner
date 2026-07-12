// The closed name → React component map (§3.3). Keys are exactly the catalog component names
// (catalog.ts is the source of truth); an unknown name is *not* here and the dispatcher renders
// a placeholder. `Map` maps to GeoMap (the JS global name is avoided in code). This module
// exports data only (no component), so the Fast-Refresh rule is unaffected.
import type { ComponentType } from 'react';
import type { ComponentNode } from '../nodes.ts';

import Kpi from './components/Kpi.tsx';
import Chart from './components/Chart.tsx';
import Table from './components/Table.tsx';
import GeoMap from './components/GeoMap.tsx';
import Facets from './components/Facets.tsx';
import Callout from './components/Callout.tsx';
import Value from './components/Value.tsx';
import Gauge from './components/Gauge.tsx';
import Section from './components/Section.tsx';
import Row from './components/Row.tsx';
import ShowAbove from './components/ShowAbove.tsx';
import ShowBelow from './components/ShowBelow.tsx';
import Params from './components/Params.tsx';
import Select from './widgets/Select.tsx';
import Toggle from './widgets/Toggle.tsx';
import Range from './widgets/Range.tsx';
import DateRange from './widgets/DateRange.tsx';

export type NodeComponent = ComponentType<{ node: ComponentNode }>;

export const componentMap: Record<string, NodeComponent> = {
  Kpi,
  Chart,
  Table,
  Map: GeoMap,
  Facets,
  Callout,
  Value,
  Gauge,
  Section,
  Row,
  ShowAbove,
  ShowBelow,
  Params,
  Select,
  Toggle,
  Range,
  DateRange,
};
