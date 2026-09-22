// The §4.4 staleness affordance (DN-R11): the notice names the staleness and its one
// action reloads — asserted as data (the copy) and as behaviour (the click).
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import DocumentChangedNotice from './DocumentChangedNotice.tsx';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('DocumentChangedNotice', () => {
  it('names the staleness plainly and offers exactly one action: reload', () => {
    const onReload = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => root.render(createElement(DocumentChangedNotice, { onReload })));
    expect(container.textContent).toContain('changed after this report was rendered');
    const button = container.querySelector('button');
    expect(button?.textContent).toContain('Reload document');
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onReload).toHaveBeenCalled();
    act(() => root.unmount());
  });
});
