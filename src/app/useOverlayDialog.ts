// The dialog-behaviour half of R-IX-1 for reckoner's two overlays (R3-610): a `role=dialog`
// surface must move focus in on open, trap Tab within, answer Escape, and return focus to
// the control that opened it — the decision set R3-592 generalized for the host's own
// chrome, written here locally because a region app cannot import the host's hooks. One
// hook, two callers (the inspector dock, the workbook panel); the SDK dialog primitive
// (R3-613) is the future swap target, and its parity test is what will make the swap safe.
import { useEffect, useRef, type RefObject } from 'react';

/** Options: `enabled` gates the whole contract (attach, focus-in, restore) on one flag. */
export interface OverlayDialogOptions {
  enabled?: boolean;
}

/**
 * The modal-dialog contract for one overlay element: attach the returned `ref` to the
 * element that carries `role="dialog"` / `aria-modal`. While enabled, focus moves to the
 * first focusable inside the element on open (the element itself, made minimally
 * focusable, when it has none), Tab and Shift-Tab wrap within it — the focusable list is
 * re-read at keydown, so a panel that mounts later (WhatIfPanel) joins the trap without a
 * re-render — Escape calls `onClose`, and disable/unmount restores the invoker captured at
 * open, guarded for an invoker that has itself unmounted.
 */
export function useOverlayDialog<T extends HTMLElement>(
  onClose: () => void,
  { enabled = true }: OverlayDialogOptions = {},
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  // Latest-ref so a parent's re-render with a new closure never re-runs the effect (which
  // would re-capture the invoker mid-dialog); the handler reads it at event time.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Anything the keyboard can stop on, disabled controls excluded, read fresh every time.
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

    const first = focusables()[0] ?? null;
    if (first) first.focus();
    else {
      // No focusable child: the root itself becomes the focus stop so Escape/Tab still land.
      root.tabIndex = -1;
      root.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const head = list[0];
      const tail = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === head || active === root) {
          e.preventDefault();
          tail.focus();
        }
      } else if (active === tail || active === root) {
        e.preventDefault();
        head.focus();
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      if (invoker !== null && invoker.isConnected) invoker.focus();
    };
  }, [enabled]);

  return ref;
}
