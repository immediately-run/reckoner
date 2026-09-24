// R3-766 (DOCUMENT_NAVIGATOR_SPEC §4.4): the change-watch loop. A dispatched workbook
// is read once; edits land out-of-band (the host editor, another tab, a sync), so
// watch the content mount and re-render on change. Pure and testable with an injected
// async generator; `useReport` stays a thin shell. Returns nothing and never throws:
// a missing/throw/erroring watch settles silently through `onUnavailable`, and an
// aborted signal ends the loop.

import fs from 'fs';
import { isDocumentPath } from './watchFilter.ts';

/** The watch seam — `fs.promises.watch`'s async iterator, injectable for tests. */
export type WatchSource = (
  path: string,
  options?: { recursive?: boolean; signal?: AbortSignal },
) => AsyncIterable<{ eventType: string; filename: string | null }>;

export interface WatchDocumentOptions {
  /** The watch to drive. Defaults to the sandbox `fs.promises.watch` (the same module
   *  `src/document/fsReader.ts` reads through).`undefined` means "no watch available". */
  watch?: WatchSource;
  /** Debounce window before a burst collapses to one `onChange` (default 250 ms). */
  debounceMs?: number;
  /** Abort ends the loop (a root change / unmount aborts the calling controller). */
  signal: AbortSignal;
  /** Reported once when the watch is missing, throws, or its iterator errors — the
   *  caller falls back to today's manual-reload behaviour. */
  onUnavailable?: () => void;
}

/**
 * Watch `root` and call `onChange` (debounced to one call per quiet window) whenever a
 * document file under it changes. `filename: null` (a change the backend cannot name) is
 * treated as a match. Never throws; an aborted `signal` ends the loop with no further calls.
 */
export function watchDocument(root: string, onChange: () => void, options: WatchDocumentOptions): void {
  const watch: WatchSource | undefined = options.watch ?? fs.promises.watch;
  void drive(root, onChange, watch, options);
}

async function drive(
  root: string,
  onChange: () => void,
  watch: WatchSource | undefined,
  { debounceMs = 250, signal, onUnavailable }: WatchDocumentOptions,
): Promise<void> {
  if (watch === undefined) {
    onUnavailable?.();
    return;
  }

  let iterator: AsyncIterator<{ eventType: string; filename: string | null }>;
  try {
    iterator = watch(root, { recursive: true, signal })[Symbol.asyncIterator]();
  } catch {
    onUnavailable?.();
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  try {
    while (true) {
      let result: IteratorResult<{ eventType: string; filename: string | null }>;
      try {
        result = await iterator.next();
      } catch {
        // An aborted watch ends quietly (an AbortError is the loop closing, not a
        // defect); any other rejection means the watch is broken — report it, stop.
        cancel();
        if (!signal.aborted) onUnavailable?.();
        return;
      }
      if (result.done) break;

      const { filename } = result.value;
      if (filename !== null && !isDocumentPath(filename)) continue;

      // Debounce: a burst (a multi-file save, a sync that replaces the tree) is one
      // rebuild, not one per file. Each match restarts the quiet window.
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(onChange, debounceMs);
    }
  } finally {
    cancel();
  }
}
