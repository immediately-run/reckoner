// Flow — the pure half of the data-positioned node/edge diagram (ARCHITECTURE_PLAN §3.3).
// Layout comes from the data: every node carries its own top-left `x,y` in diagram units and
// every edge its own optional waypoints, so there is no auto-layout, no force simulation and
// no layout library — the template never computes (§3.3.1 "never an expression") and the
// drawing is stable across captures. This module turns the two bound tables into a checked
// model (loud on any malformed row — never a partial silent drawing) and does the geometry:
// `via` parsing, anchor choice, the polyline, its length, the point at a fraction along it,
// the annotation layout and the viewBox. No React; unit-tested directly.

import type { Row, Value } from '../../stdlib/types.ts';

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FLOW_SHAPES = ['box', 'pill', 'diamond', 'note'] as const;
export const FLOW_TONES = ['agent', 'operator', 'owner', 'ci', 'neutral'] as const;
export type FlowShape = (typeof FLOW_SHAPES)[number];
export type FlowTone = (typeof FLOW_TONES)[number];

/** Size and count caps: a diagram past these is a broken tile, not a hairball. */
export const MAX_FLOW_NODES = 80;
export const MAX_FLOW_EDGES = 160;
export const DEFAULT_NODE_W = 140;
export const DEFAULT_NODE_H = 56;
/** The viewBox margin around every node, waypoint and annotation. */
export const FLOW_MARGIN = 24;
/** The value-stream-map inventory triangle's width (diagram units). */
export const BUFFER_TRIANGLE_W = 22;

export interface FlowNode extends Box {
  id: string;
  label: string;
  sub?: string;
  shape: FlowShape;
  tone: FlowTone;
}

export interface FlowEdge {
  from: string;
  to: string;
  via: Pt[];
  label?: string;
  value?: string;
  tone: FlowTone;
  alert: boolean;
  dashed: boolean;
  at: number;
  buffer: boolean;
}

export interface FlowModel {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type Checked<T> = { ok: true; data: T } | { ok: false; reason: string };

// ── via ──────────────────────────────────────────────────────────────────────────────

/** Parse `via` — whitespace-separated `x,y` pairs (diagram units). Empty/absent → no waypoints. */
export function parseVia(via: string | undefined): Checked<Pt[]> {
  if (via === undefined || via.trim() === '') return { ok: true, data: [] };
  const points: Pt[] = [];
  for (const pair of via.trim().split(/\s+/)) {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(pair);
    if (m === null) return { ok: false, reason: `malformed waypoint "${pair}" (expected "x,y")` };
    points.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return { ok: true, data: points };
}

// ── row checking ─────────────────────────────────────────────────────────────────────

const isNum = (v: Value | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const absent = (v: Value | undefined): boolean => v === undefined || v === null;

function optionalNumber(row: Row, key: string): Checked<number | undefined> {
  const v = row[key];
  if (absent(v)) return { ok: true, data: undefined };
  return isNum(v) ? { ok: true, data: v } : { ok: false, reason: `"${key}" is not a number` };
}

function optionalString(row: Row, key: string): Checked<string | undefined> {
  const v = row[key];
  if (absent(v)) return { ok: true, data: undefined };
  return typeof v === 'string' ? { ok: true, data: v } : { ok: false, reason: `"${key}" is not a string` };
}

function optionalBool(row: Row, key: string): Checked<boolean> {
  const v = row[key];
  if (absent(v)) return { ok: true, data: false };
  return typeof v === 'boolean' ? { ok: true, data: v } : { ok: false, reason: `"${key}" is not true/false` };
}

function optionalEnum<T extends string>(row: Row, key: string, values: readonly T[], fallback: T): Checked<T> {
  const v = row[key];
  if (absent(v)) return { ok: true, data: fallback };
  return typeof v === 'string' && (values as readonly string[]).includes(v)
    ? { ok: true, data: v as T }
    : { ok: false, reason: `"${key}" must be one of ${values.join(', ')}` };
}

function checkNode(row: Row, i: number): Checked<FlowNode> {
  const where = typeof row.id === 'string' && row.id !== '' ? `node "${row.id}"` : `node row ${i + 1}`;
  const fail = (reason: string): Checked<FlowNode> => ({ ok: false, reason: `${where}: ${reason}` });
  if (typeof row.id !== 'string' || row.id === '') return fail('missing "id"');
  if (absent(row.x)) return fail('missing "x"');
  if (absent(row.y)) return fail('missing "y"');
  if (!isNum(row.x)) return fail('"x" is not a number');
  if (!isNum(row.y)) return fail('"y" is not a number');
  const label = optionalString(row, 'label');
  if (!label.ok) return fail(label.reason);
  const sub = optionalString(row, 'sub');
  if (!sub.ok) return fail(sub.reason);
  const w = optionalNumber(row, 'w');
  if (!w.ok) return fail(w.reason);
  const h = optionalNumber(row, 'h');
  if (!h.ok) return fail(h.reason);
  if ((w.data !== undefined && w.data <= 0) || (h.data !== undefined && h.data <= 0)) return fail('"w"/"h" must be positive');
  const shape = optionalEnum(row, 'shape', FLOW_SHAPES, 'box');
  if (!shape.ok) return fail(shape.reason);
  const tone = optionalEnum(row, 'tone', FLOW_TONES, 'neutral');
  if (!tone.ok) return fail(tone.reason);
  return {
    ok: true,
    data: {
      id: row.id,
      label: label.data ?? row.id,
      ...(sub.data !== undefined ? { sub: sub.data } : {}),
      x: row.x,
      y: row.y,
      w: w.data ?? DEFAULT_NODE_W,
      h: h.data ?? DEFAULT_NODE_H,
      shape: shape.data,
      tone: tone.data,
    },
  };
}

function checkEdge(row: Row, i: number, ids: ReadonlySet<string>): Checked<FlowEdge> {
  const named = typeof row.from === 'string' && typeof row.to === 'string';
  const where = named ? `edge ${String(row.from)} → ${String(row.to)}` : `edge row ${i + 1}`;
  const fail = (reason: string): Checked<FlowEdge> => ({ ok: false, reason: `${where}: ${reason}` });
  if (typeof row.from !== 'string' || row.from === '') return fail('missing "from"');
  if (typeof row.to !== 'string' || row.to === '') return fail('missing "to"');
  if (!ids.has(row.from)) return fail(`unknown node id "${row.from}"`);
  if (!ids.has(row.to)) return fail(`unknown node id "${row.to}"`);
  const viaStr = optionalString(row, 'via');
  if (!viaStr.ok) return fail(viaStr.reason);
  const via = parseVia(viaStr.data);
  if (!via.ok) return fail(via.reason);
  const label = optionalString(row, 'label');
  if (!label.ok) return fail(label.reason);
  const rawValue = row.value;
  if (!absent(rawValue) && typeof rawValue !== 'string' && !isNum(rawValue)) return fail('"value" must be text or a number');
  const tone = optionalEnum(row, 'tone', FLOW_TONES, 'neutral');
  if (!tone.ok) return fail(tone.reason);
  const alert = optionalBool(row, 'alert');
  if (!alert.ok) return fail(alert.reason);
  const dashed = optionalBool(row, 'dashed');
  if (!dashed.ok) return fail(dashed.reason);
  const buffer = optionalBool(row, 'buffer');
  if (!buffer.ok) return fail(buffer.reason);
  const at = optionalNumber(row, 'at');
  if (!at.ok) return fail(at.reason);
  if (at.data !== undefined && (at.data < 0 || at.data > 1)) return fail('"at" must be between 0 and 1');
  return {
    ok: true,
    data: {
      from: row.from,
      to: row.to,
      via: via.data,
      ...(label.data !== undefined ? { label: label.data } : {}),
      ...(!absent(rawValue) ? { value: String(rawValue) } : {}),
      tone: tone.data,
      alert: alert.data,
      dashed: dashed.data,
      at: at.data ?? 0.5,
      buffer: buffer.data,
    },
  };
}

/**
 * Check both tables into a `FlowModel`. The first offending row (by id where it has one)
 * is the reason; there is no partial result.
 */
export function readFlow(nodeRows: readonly Row[], edgeRows: readonly Row[]): Checked<FlowModel> {
  if (nodeRows.length === 0) return { ok: false, reason: 'no nodes to draw' };
  if (nodeRows.length > MAX_FLOW_NODES) return { ok: false, reason: `${nodeRows.length} nodes exceeds the ${MAX_FLOW_NODES}-node cap` };
  if (edgeRows.length > MAX_FLOW_EDGES) return { ok: false, reason: `${edgeRows.length} edges exceeds the ${MAX_FLOW_EDGES}-edge cap` };
  const nodes: FlowNode[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < nodeRows.length; i++) {
    const n = checkNode(nodeRows[i], i);
    if (!n.ok) return n;
    if (ids.has(n.data.id)) return { ok: false, reason: `node "${n.data.id}": duplicate id` };
    ids.add(n.data.id);
    nodes.push(n.data);
  }
  const edges: FlowEdge[] = [];
  for (let i = 0; i < edgeRows.length; i++) {
    const e = checkEdge(edgeRows[i], i, ids);
    if (!e.ok) return e;
    edges.push(e.data);
  }
  return { ok: true, data: { nodes, edges } };
}

// ── geometry ─────────────────────────────────────────────────────────────────────────

/**
 * The edge's two anchors. The end is always the target's left-middle. The start is the
 * source's right-middle — except when the target lies wholly below the source and not
 * wholly to its right (`to.y ≥ from.y + from.h` and `to.x < from.x + from.w`), where it
 * leaves from the source's bottom-middle (a drop to the next row). Any other routing is
 * the author's, through `via`.
 */
export function anchors(from: Box, to: Box): { start: Pt; end: Pt } {
  const toRight = to.x >= from.x + from.w;
  const below = to.y >= from.y + from.h;
  const start = !toRight && below ? { x: from.x + from.w / 2, y: from.y + from.h } : { x: from.x + from.w, y: from.y + from.h / 2 };
  return { start, end: { x: to.x, y: to.y + to.h / 2 } };
}

/** The polyline: start anchor → waypoints → end anchor, straight segments between them. */
export function polyline(from: Box, to: Box, via: readonly Pt[]): Pt[] {
  const { start, end } = anchors(from, to);
  return [start, ...via, end];
}

export function polylineLength(points: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/** The point at fraction `t` (clamped to [0,1]) of the polyline's length. */
export function pointAt(points: readonly Pt[], t: number): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  const total = polylineLength(points);
  if (total === 0) return { ...points[0] };
  let remaining = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= seg && seg > 0) {
      const f = remaining / seg;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    remaining -= seg;
  }
  return { ...points[points.length - 1] };
}

/** The SVG path `d` for a polyline. */
export function pathD(points: readonly Pt[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** A rough text width (diagram units) — enough to keep annotations inside the viewBox. */
const CHAR_W = 7;

export interface AnnotationLayout {
  /** Triangle vertices as an SVG `points` string, present only for a buffer. */
  triangle?: string;
  labelY?: number;
  valueY?: number;
  x: number;
  /** Extent of everything the annotation draws. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Where an annotation's parts go around its anchor point `p`. Plain annotation: label and
 * value stacked just above the line. Buffer: an inventory triangle (apex up,
 * `BUFFER_TRIANGLE_W` wide) centered on the line with the text stacked beneath it.
 */
export function annotationLayout(p: Pt, a: { label?: string; value?: string; buffer: boolean }): AnnotationLayout {
  const lines = [a.label, a.value].filter((s): s is string => s !== undefined && s !== '');
  const textW = Math.max(0, ...lines.map((s) => s.length * CHAR_W));
  const halfW = Math.max(a.buffer ? BUFFER_TRIANGLE_W / 2 : 0, textW / 2);
  if (a.buffer) {
    const half = BUFFER_TRIANGLE_W / 2;
    const triangle = `${round(p.x)},${round(p.y - 10)} ${round(p.x + half)},${round(p.y + 9)} ${round(p.x - half)},${round(p.y + 9)}`;
    let y = p.y + 9;
    const labelY = a.label ? (y += 15) : undefined;
    const valueY = a.value !== undefined && a.value !== '' ? (y += 15) : undefined;
    return { triangle, labelY, valueY, x: p.x, box: { x0: p.x - halfW, y0: p.y - 10, x1: p.x + halfW, y1: y + 4 } };
  }
  const hasValue = a.value !== undefined && a.value !== '';
  const valueY = hasValue ? p.y - 6 : undefined;
  const labelY = a.label ? (hasValue ? p.y - 21 : p.y - 6) : undefined;
  const top = (labelY ?? valueY ?? p.y) - 12;
  return { labelY, valueY, x: p.x, box: { x0: p.x - halfW, y0: top, x1: p.x + halfW, y1: p.y } };
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The bounding box of all nodes, all polyline points and all annotation extents, plus `FLOW_MARGIN`. */
export function viewBox(nodes: readonly Box[], polylines: readonly (readonly Pt[])[], annotations: readonly AnnotationLayout[]): ViewBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (ax: number, ay: number, bx: number, by: number): void => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
  };
  for (const n of nodes) add(n.x, n.y, n.x + n.w, n.y + n.h);
  for (const line of polylines) for (const p of line) add(p.x, p.y, p.x, p.y);
  for (const a of annotations) add(a.box.x0, a.box.y0, a.box.x1, a.box.y1);
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: FLOW_MARGIN * 2, h: FLOW_MARGIN * 2 };
  return { x: x0 - FLOW_MARGIN, y: y0 - FLOW_MARGIN, w: x1 - x0 + FLOW_MARGIN * 2, h: y1 - y0 + FLOW_MARGIN * 2 };
}

/** The full drawing plan for a checked model — what the component renders, pure. */
export interface FlowPlan {
  nodes: FlowNode[];
  edges: { edge: FlowEdge; points: Pt[]; d: string; annotation?: AnnotationLayout }[];
  viewBox: ViewBox;
}

export function planFlow(model: FlowModel): FlowPlan {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const edges = model.edges.map((edge) => {
    const points = polyline(byId.get(edge.from)!, byId.get(edge.to)!, edge.via);
    const annotated = edge.buffer || (edge.label ?? '') !== '' || (edge.value ?? '') !== '';
    const annotation = annotated ? annotationLayout(pointAt(points, edge.at), edge) : undefined;
    return { edge, points, d: pathD(points), ...(annotation ? { annotation } : {}) };
  });
  const vb = viewBox(
    model.nodes,
    edges.map((e) => e.points),
    edges.flatMap((e) => (e.annotation ? [e.annotation] : [])),
  );
  return { nodes: model.nodes, edges, viewBox: vb };
}

/** The screen-reader text: title, then each annotated edge as "from → to: label value". */
export function flowAriaLabel(title: string | undefined, plan: FlowPlan): string {
  const byId = new Map(plan.nodes.map((n) => [n.id, n.label]));
  const head = `${title ?? 'Flow diagram'}: ${plan.nodes.length} ${plan.nodes.length === 1 ? 'node' : 'nodes'}, ${plan.edges.length} ${plan.edges.length === 1 ? 'connection' : 'connections'}.`;
  const notes = plan.edges
    .filter((e) => e.annotation !== undefined)
    .map(({ edge }) => {
      const text = [edge.label, edge.value].filter((s) => s !== undefined && s !== '').join(' ');
      return `${byId.get(edge.from)} → ${byId.get(edge.to)}: ${text}${edge.alert ? ' (alert)' : ''}`;
    });
  return notes.length === 0 ? head : `${head} ${notes.join('; ')}.`;
}
