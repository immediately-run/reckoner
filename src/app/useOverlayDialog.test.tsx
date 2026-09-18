// @vitest-environment happy-dom
// The overlay-dialog contract (R3-610): focus in on open, Tab wrap read at keydown, Escape
// only while enabled, invoker restored on close — over a real component tree in a DOM, not
// a static render, because every one of those is an effect- or event-time behaviour. The
// two harness shapes mirror the two call sites: the dock (App holds the hook behind an
// `enabled` flag, the element conditionally rendered) and the workbook panel (the mounted
// component holds the hook itself, enabled by default).
import { describe, it, expect, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useOverlayDialog } from './useOverlayDialog.ts';

// react-dom/client requires the act environment flag to flush effects deterministically.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
};

/** Dispatch a keydown from the element (bubbles to the overlay root, as a real key does). */
function key(el: Element, k: string, shift = false): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, shiftKey: shift }));
}

interface MountHandle {
  rerender: (next: ReactElement) => void;
  unmount: () => void;
}

function mount(tree: ReactElement): MountHandle {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(tree));
  return {
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

// — The dock shape: App owns the hook and the conditional element, `enabled` gating both. —
function DockHarness({ open, enabled, onClose, lateFocusable }: { open: boolean; enabled: boolean; onClose: () => void; lateFocusable?: boolean }) {
  const ref = useOverlayDialog<HTMLDivElement>(onClose, { enabled });
  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', id: 'invoker' }, 'Inspect'),
    open &&
      createElement(
        'div',
        { id: 'overlay', ref },
        createElement('button', { type: 'button', id: 'first' }, 'First'),
        createElement('button', { type: 'button', id: 'last' }, 'Last'),
        lateFocusable === true && createElement('button', { type: 'button', id: 'late' }, 'Late'),
      ),
  );
}

// — The panel shape: the mounted component owns the hook, enabled defaults to true. —
function PanelHarness({ open, onClose, invokerPresent = true }: { open: boolean; onClose: () => void; invokerPresent?: boolean }) {
  return createElement(
    'div',
    null,
    invokerPresent && createElement('button', { type: 'button', id: 'invoker' }, 'Workbook'),
    open &&
      createElement(
        'aside',
        { id: 'panel' },
        createElement(PanelBody, { onClose }),
      ),
  );
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const ref = useOverlayDialog<HTMLElement>(onClose);
  return createElement('aside', { id: 'overlay', ref }, createElement('button', { type: 'button', id: 'first' }, 'Close'));
}

describe('useOverlayDialog — the overlay contract (R3-610)', () => {
  it('moves focus to the first focusable inside on enable, and restores the invoker on disable', () => {
    const onClose = vi.fn();
    const h = mount(createElement(DockHarness, { open: true, enabled: false, onClose }));
    byId('invoker').focus();
    expect(document.activeElement).toBe(byId('invoker'));
    h.rerender(createElement(DockHarness, { open: true, enabled: true, onClose }));
    expect(document.activeElement).toBe(byId('first'));
    h.rerender(createElement(DockHarness, { open: true, enabled: false, onClose }));
    expect(document.activeElement).toBe(byId('invoker'));
    h.unmount();
  });

  it('the mounted-panel shape captures the invoker and restores it when the panel unmounts', () => {
    const onClose = vi.fn();
    const h = mount(createElement(PanelHarness, { open: false, onClose }));
    byId('invoker').focus();
    h.rerender(createElement(PanelHarness, { open: true, onClose }));
    expect(document.activeElement).toBe(byId('first'));
    // The panel's own conditional unmount (App keeps rendering the header toggle) runs the
    // restore; the invoker survives, as the real rk-review-toggle does.
    h.rerender(createElement(PanelHarness, { open: false, onClose }));
    expect(document.activeElement).toBe(byId('invoker'));
    h.unmount();
  });

  it('focus lands on the overlay root itself when it has no focusable child', () => {
    const onClose = vi.fn();
    const h = mount(createElement(DockHarness, { open: true, enabled: true, onClose }));
    // The default harness has focusables; re-render a bare-root variant through the panel
    // shape with an empty overlay to hit the fallback.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    function Bare() {
      const ref = useOverlayDialog<HTMLElement>(onClose);
      return createElement('aside', { id: 'bare', ref });
    }
    act(() => root.render(createElement(Bare)));
    const bare = byId('bare');
    expect(document.activeElement).toBe(bare);
    expect(bare.tabIndex).toBe(-1);
    act(() => root.unmount());
    container.remove();
    h.unmount();
  });

  it('Tab wraps both ways, including over a focusable that appears after mount', () => {
    const onClose = vi.fn();
    const h = mount(createElement(DockHarness, { open: true, enabled: true, onClose }));
    byId('last').focus();
    let ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    byId('last').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('first'));

    ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, shiftKey: true });
    byId('first').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('last'));

    // A focusable mounted later (WhatIfPanel appearing inside the dock) joins the wrap —
    // the list is read at keydown, never cached at mount.
    h.rerender(createElement(DockHarness, { open: true, enabled: true, onClose, lateFocusable: true }));
    byId('late').focus();
    ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    byId('late').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('first'));
    h.unmount();
  });

  it('Tab on the childless root is held, not released to the page behind', () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    function Bare() {
      const ref = useOverlayDialog<HTMLElement>(onClose);
      return createElement('aside', { id: 'bare', ref });
    }
    act(() => root.render(createElement(Bare)));
    const bare = byId('bare');
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    bare.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(bare);
    act(() => root.unmount());
    container.remove();
  });

  it('Escape calls onClose while enabled, and never while disabled', () => {
    const onClose = vi.fn();
    const h = mount(createElement(DockHarness, { open: true, enabled: true, onClose }));
    key(byId('first'), 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    // enabled false → the listener is detached; Escape on the same tree does nothing.
    h.rerender(createElement(DockHarness, { open: true, enabled: false, onClose }));
    key(byId('first'), 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it('an invoker that unmounted before the overlay closes does not throw', () => {
    const onClose = vi.fn();
    const h = mount(createElement(PanelHarness, { open: false, onClose }));
    byId('invoker').focus();
    h.rerender(createElement(PanelHarness, { open: true, onClose }));
    expect(() => h.rerender(createElement(PanelHarness, { open: true, onClose, invokerPresent: false }))).not.toThrow();
    expect(() => h.unmount()).not.toThrow();
  });
});
