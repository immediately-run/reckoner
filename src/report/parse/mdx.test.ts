import { describe, expect, it } from 'vitest';
import { parseTemplate } from './mdx.ts';
import type { ComponentNode, MarkdownNode } from '../nodes.ts';
import { validateTemplate } from '../validate.ts';

describe('parseTemplate', () => {
  it('keeps markdown prose as opaque text', () => {
    const nodes = parseTemplate('# Weekly revenue.\n\nSome prose here.');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('markdown');
    expect((nodes[0] as MarkdownNode).text).toContain('# Weekly revenue.');
  });

  it('parses a self-closing component with typed literal attributes', () => {
    const [node] = parseTemplate('<Kpi source="revenue.total" spark format="currency" />');
    const c = node as ComponentNode;
    expect(c.type).toBe('component');
    expect(c.name).toBe('Kpi');
    expect(c.attrs.source).toEqual({ kind: 'literal', value: 'revenue.total' });
    expect(c.attrs.spark).toEqual({ kind: 'literal', value: true }); // bare boolean
    expect(c.attrs.format).toEqual({ kind: 'literal', value: 'currency' });
  });

  it('captures braced literals as literals and expressions as inert', () => {
    const [node] = parseTemplate('<Select name="region" options={["all", "emea"]} evil={fetch("/x")} />');
    const c = node as ComponentNode;
    expect(c.attrs.options).toEqual({ kind: 'literal', value: ['all', 'emea'] });
    expect(c.attrs.evil.kind).toBe('inert'); // never evaluated
    expect(c.attrs.evil).toMatchObject({ kind: 'inert', text: 'fetch("/x")' });
  });

  it('parses nested children (Facets wraps a Chart)', () => {
    const src = '<Facets source="churn.by_cohort" by="cohort">\n  <Chart kind="bar" x="month" y="churned" />\n</Facets>';
    const [node] = parseTemplate(src);
    const c = node as ComponentNode;
    expect(c.name).toBe('Facets');
    const child = c.children.find((n): n is ComponentNode => n.type === 'component');
    expect(child?.name).toBe('Chart');
    expect(child?.attrs.kind).toEqual({ kind: 'literal', value: 'bar' });
  });

  it('interleaves prose and components at block level', () => {
    const src = '# Report.\n\n<Kpi source="revenue.total" />\n\nMore prose.';
    const nodes = parseTemplate(src);
    const kinds = nodes.map((n) => (n.type === 'component' ? n.name : 'md'));
    expect(kinds).toEqual(['md', 'Kpi', 'md']);
  });

  it('produces trees the existing validator accepts', () => {
    const src = '<Params>\n<Select name="region" options={["all","emea"]} default="all" />\n</Params>\n<Kpi source="revenue.total" format="currency" />';
    const nodes = parseTemplate(src);
    const result = validateTemplate(nodes);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.bindings).toContain('revenue.total');
  });

  it('an unknown component still parses to a node (renders as placeholder later)', () => {
    const [node] = parseTemplate('<Timeline source="x.y" />');
    expect((node as ComponentNode).name).toBe('Timeline');
    expect(validateTemplate([node]).placeholders).toEqual(['Timeline']);
  });
});
