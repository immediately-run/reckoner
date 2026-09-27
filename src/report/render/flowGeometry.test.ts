import { describe, expect, it } from 'vitest';
import {
  anchors,
  annotationLayout,
  flowAriaLabel,
  FLOW_MARGIN,
  planFlow,
  pointAt,
  polyline,
  polylineLength,
  parseVia,
  readFlow,
  viewBox,
} from './flowGeometry.ts';

describe('parseVia', () => {
  it('parses whitespace-separated x,y pairs, including negatives and decimals', () => {
    expect(parseVia('10,20  30.5,-4')).toEqual({ ok: true, data: [{ x: 10, y: 20 }, { x: 30.5, y: -4 }] });
  });
  it('absent or blank → no waypoints', () => {
    expect(parseVia(undefined)).toEqual({ ok: true, data: [] });
    expect(parseVia('  ')).toEqual({ ok: true, data: [] });
  });
  it('malformed pairs are an error naming the pair', () => {
    for (const bad of ['10;20', '10,', 'a,b', '1,2,3', '10 20']) {
      const r = parseVia(bad);
      expect(r.ok, bad).toBe(false);
    }
    const r = parseVia('1,2 x,3');
    expect(r.ok === false && r.reason).toMatch(/"x,3"/);
  });
});

describe('anchors', () => {
  const a = { x: 0, y: 0, w: 100, h: 40 };
  it('target to the right → source right-middle to target left-middle', () => {
    expect(anchors(a, { x: 200, y: 0, w: 100, h: 40 })).toEqual({ start: { x: 100, y: 20 }, end: { x: 200, y: 20 } });
  });
  it('target to the right AND below still leaves from the right-middle', () => {
    expect(anchors(a, { x: 200, y: 100, w: 100, h: 40 }).start).toEqual({ x: 100, y: 20 });
  });
  it('target below and not to the right → source bottom-middle', () => {
    expect(anchors(a, { x: 0, y: 100, w: 100, h: 40 })).toEqual({ start: { x: 50, y: 40 }, end: { x: 0, y: 120 } });
  });
  it('target overlapping vertically and to the left (a return) stays right-middle', () => {
    expect(anchors({ x: 300, y: 0, w: 100, h: 40 }, a).start).toEqual({ x: 400, y: 20 });
  });
});

describe('polyline, length, point-at-fraction', () => {
  // Two segments: (100,20) → (100,120) [100 long] → (200,120) [100 long].
  const from = { x: 0, y: 0, w: 100, h: 40 };
  const to = { x: 200, y: 100, w: 100, h: 40 };
  const pts = polyline(from, to, [{ x: 100, y: 120 }]);
  // start is right-middle (100,20); via (100,120); end left-middle (200,120)

  it('threads the waypoints between the anchors', () => {
    expect(pts).toEqual([{ x: 100, y: 20 }, { x: 100, y: 120 }, { x: 200, y: 120 }]);
  });
  it('sums segment lengths', () => {
    expect(polylineLength(pts)).toBe(200);
  });
  it('point at 0, 0.5, 1 on a two-segment path', () => {
    expect(pointAt(pts, 0)).toEqual({ x: 100, y: 20 });
    expect(pointAt(pts, 0.5)).toEqual({ x: 100, y: 120 });
    expect(pointAt(pts, 0.75)).toEqual({ x: 150, y: 120 });
    expect(pointAt(pts, 1)).toEqual({ x: 200, y: 120 });
  });
  it('clamps out-of-range fractions', () => {
    expect(pointAt(pts, -1)).toEqual({ x: 100, y: 20 });
    expect(pointAt(pts, 2)).toEqual({ x: 200, y: 120 });
  });
});

describe('viewBox', () => {
  it('is the bounding box of nodes + margin', () => {
    expect(viewBox([{ x: 0, y: 0, w: 100, h: 50 }, { x: 200, y: 100, w: 100, h: 50 }], [], [])).toEqual({
      x: -FLOW_MARGIN,
      y: -FLOW_MARGIN,
      w: 300 + 2 * FLOW_MARGIN,
      h: 150 + 2 * FLOW_MARGIN,
    });
  });
  it('grows to include waypoints and annotation extents', () => {
    const nodes = [{ x: 0, y: 0, w: 100, h: 50 }];
    const vbWay = viewBox(nodes, [[{ x: 50, y: 300 }]], []);
    expect(vbWay.h).toBe(300 + 2 * FLOW_MARGIN);
    const anno = annotationLayout({ x: 50, y: 0 }, { label: 'queue', value: '3', buffer: true });
    expect(anno.box.y0).toBeLessThan(0);
    const vbAnno = viewBox(nodes, [], [anno]);
    expect(vbAnno.y).toBe(anno.box.y0 - FLOW_MARGIN);
    const wide = annotationLayout({ x: 50, y: 25 }, { label: 'a very long annotation label here', buffer: false });
    expect(viewBox(nodes, [], [wide]).x).toBe(wide.box.x0 - FLOW_MARGIN);
    expect(wide.box.x0).toBeLessThan(0);
  });
});

describe('annotationLayout', () => {
  it('a buffer draws a 22-unit triangle centered on the point with text below', () => {
    const a = annotationLayout({ x: 100, y: 50 }, { label: 'review', value: '4', buffer: true });
    expect(a.triangle).toBe('100,40 111,59 89,59');
    expect(a.labelY!).toBeGreaterThan(59);
    expect(a.valueY!).toBeGreaterThan(a.labelY!);
  });
  it('a plain annotation stacks label over value above the line', () => {
    const a = annotationLayout({ x: 0, y: 50 }, { label: 'l', value: 'v', buffer: false });
    expect(a.triangle).toBeUndefined();
    expect(a.labelY!).toBeLessThan(a.valueY!);
    expect(a.valueY!).toBeLessThan(50);
  });
});

describe('readFlow — loud shape guards', () => {
  const n = (id: string, x = 0, y = 0) => ({ id, label: id.toUpperCase(), x, y });
  it('applies defaults', () => {
    const r = readFlow([n('a'), { id: 'b', x: 200, y: 0 }], [{ from: 'a', to: 'b', value: 3 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nodes[0]).toMatchObject({ w: 140, h: 56, shape: 'box', tone: 'neutral' });
    expect(r.data.nodes[1].label).toBe('b'); // label falls back to id
    expect(r.data.edges[0]).toMatchObject({ at: 0.5, value: '3', alert: false, dashed: false, buffer: false, via: [] });
  });
  it('names the first offending row or id', () => {
    const cases: [unknown[], unknown[], RegExp][] = [
      [[{ label: 'x', x: 0, y: 0 }], [], /node row 1: missing "id"/],
      [[n('a'), { id: 'b', y: 0 }], [], /node "b": missing "x"/],
      [[{ id: 'c', x: '10', y: 0 }], [], /node "c": "x" is not a number/],
      [[{ ...n('d'), shape: 'hexagon' }], [], /node "d": "shape"/],
      [[n('a'), n('a')], [], /duplicate id/],
      [[n('a')], [{ to: 'a' }], /edge row 1: missing "from"/],
      [[n('a')], [{ from: 'a', to: 'ghost' }], /unknown node id "ghost"/],
      [[n('a'), n('b')], [{ from: 'a', to: 'b', via: 'nope' }], /edge a → b: malformed waypoint/],
      [[n('a'), n('b')], [{ from: 'a', to: 'b', at: 1.5 }], /"at" must be between 0 and 1/],
      [[], [], /no nodes/],
    ];
    for (const [nodes, edges, re] of cases) {
      const r = readFlow(nodes as never, edges as never);
      expect(r.ok === false && r.reason, String(re)).toMatch(re);
    }
  });
  it('caps nodes at 80 and edges at 160', () => {
    const many = Array.from({ length: 81 }, (_, i) => n(`n${i}`));
    const r = readFlow(many, []);
    expect(r.ok === false && r.reason).toMatch(/81 nodes exceeds the 80-node cap/);
    const edges = Array.from({ length: 161 }, () => ({ from: 'a', to: 'a' }));
    const r2 = readFlow([n('a')], edges);
    expect(r2.ok === false && r2.reason).toMatch(/161 edges/);
  });
});

describe('planFlow + aria label', () => {
  it('annotates only edges with a label, value or buffer and lists them for screen readers', () => {
    const r = readFlow(
      [
        { id: 'a', label: 'Drafting', x: 0, y: 0 },
        { id: 'b', label: 'Review gate', x: 300, y: 0 },
      ],
      [
        { from: 'a', to: 'b', label: 'waiting', value: 7, buffer: true, alert: true },
        { from: 'b', to: 'a', dashed: true, via: '440,120 -20,120' },
      ],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const plan = planFlow(r.data);
    expect(plan.edges[0].annotation?.triangle).toBeDefined();
    expect(plan.edges[1].annotation).toBeUndefined();
    expect(plan.edges[0].d).toBe('M140 28 L300 28');
    expect(plan.viewBox.x).toBe(-20 - FLOW_MARGIN); // the return path's waypoint widens it
    expect(flowAriaLabel('The roadmap factory', plan)).toBe(
      'The roadmap factory: 2 nodes, 2 connections. Drafting → Review gate: waiting 7 (alert).',
    );
  });
});
