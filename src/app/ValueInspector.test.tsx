// The value inspector's edit door (DOCUMENT_NAVIGATOR_SPEC §3, R3-447): the chip
// renders beside the `file:line` anchor ONLY where the row's path passes the gate —
// absent (never disabled) otherwise — the RCD §5.1 disclosure rides the button, and
// a click hands the row's own path to the door. Static render covers
// presence/absence and the no-host-boot property (the §4.1 hazard, G-DN-B8's unit
// half); the DOM half drives the click. G-DN-B6's unit half.
import { describe, it, expect, vi } from 'vitest';
// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import ValueInspector from './ValueInspector.tsx';
import type { CellDescriptor, TestDescriptor } from '../engine/worker/protocol.ts';

const cell = (): CellDescriptor =>
  ({
    id: 'total',
    worksheet: 'review',
    span: { line: 12 },
    doc: 'Latest MRR',
    formulaSource: 'rows[rows.length - 1].mrr',
    resolvers: [],
  }) as unknown as CellDescriptor;

const test_ = (): TestDescriptor =>
  ({ id: 't1', kind: 'specification', name: 'oracle', subject: 'total', worksheet: 'checks', span: { line: 3 } }) as unknown as TestDescriptor;

const worksheetPaths = { review: 'worksheets/review.sheet.js', checks: 'worksheets/checks.sheet.js' };

const baseProps = {
  cell: cell(),
  cells: [cell()],
  tests: [test_()],
  verdicts: null,
  result: undefined,
  onNavigate: () => {},
  onClose: () => {},
  worksheetPaths,
};

const DISCLOSURE = 'Edits save to the mounted content. Proposing a change back to its repository is not wired yet.';

describe('ValueInspector — the edit door (absent unless writable)', () => {
  it('no door at all when the port is not wired (the seed, non-dispatched flow)', () => {
    const html = renderToStaticMarkup(createElement(ValueInspector, baseProps));
    expect(html).toContain('worksheets/review.sheet.js:12'); // the anchors are still data
    expect(html).not.toContain('>edit<');
    expect(html).not.toContain(DISCLOSURE);
  });

  it('no door when the row’s own path fails the gate (a hostile manifest path)', () => {
    const html = renderToStaticMarkup(
      createElement(ValueInspector, {
        ...baseProps,
        worksheetPaths: { review: 'worksheets/../../evil.sheet.js', checks: 'worksheets/checks.sheet.js' },
        canEditPath: (rel) => rel === 'worksheets/checks.sheet.js',
        onEdit: () => {},
      }),
    );
    // the formula row’s path is refused → its door is absent; the CLEAN test row keeps its own
    expect((html.match(/>edit</g) ?? []).length).toBe(1);
  });

  it('the door renders beside BOTH anchors — the formula row and each test row — with the disclosure', () => {
    const html = renderToStaticMarkup(
      createElement(ValueInspector, {
        ...baseProps,
        canEditPath: () => true,
        onEdit: () => {},
      }),
    );
    expect(html).toContain('worksheets/review.sheet.js:12');
    expect(html).toContain('worksheets/checks.sheet.js:3');
    expect((html.match(/>edit</g) ?? []).length).toBe(2);
    expect(html).toContain(DISCLOSURE);
    expect(html).toContain(`title="${DISCLOSURE}"`);
  });

  it('a click hands the row’s own document-relative path to the door', () => {
    const onEdit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(
        createElement(ValueInspector, {
          ...baseProps,
          canEditPath: () => true,
          onEdit,
        }),
      );
    });
    const buttons = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'edit');
    expect(buttons.length).toBe(2);
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onEdit).toHaveBeenCalledWith('worksheets/review.sheet.js');
    expect(onEdit).toHaveBeenCalledWith('worksheets/checks.sheet.js');
    act(() => root.unmount());
  });
});
