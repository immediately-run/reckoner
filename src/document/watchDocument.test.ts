// watchDocument drives an injected async-generator `watch`; it never throws, collapses a
// burst to one `onChange`, and reports a broken watch through `onUnavailable` instead of
// surfacing an error. Debounce is tested against a real short window rather than fake
// timers, so the async generator's microtask delivery and the timer agree about time.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { watchDocument, type WatchSource } from './watchDocument.ts';

type Event = { eventType: string; filename: string | null };

/** A watch source yielding `events`, then staying open like the real infinite watch. */
const source = (events: Event[]): WatchSource =>
  () =>
    (async function* () {
      for (const ev of events) yield ev;
      await new Promise<never>(() => {}); // a live watch never completes on its own
    })();

const controller = (): AbortController => new AbortController();

const settle = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('watchDocument', () => {
  it('collapses a burst of document events to one onChange', async () => {
    const onChange = vi.fn();
    watchDocument('/root', onChange, {
      signal: controller().signal,
      debounceMs: 5,
      watch: source([
        { eventType: 'change', filename: 'worksheets/a.sheet.js' },
        { eventType: 'change', filename: 'templates/b.mdx' },
        { eventType: 'change', filename: 'feeds/c.feed.json' },
        { eventType: 'change', filename: 'fixtures/d.frame.json' },
        { eventType: 'change', filename: 'reckoner.json' },
      ]),
    });
    await settle(30); // a full, quiet debounce window past the last event
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-document change', async () => {
    const onChange = vi.fn();
    watchDocument('/root', onChange, {
      signal: controller().signal,
      debounceMs: 5,
      watch: source([{ eventType: 'change', filename: 'README.md' }]),
    });
    await settle(30);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('treats a null filename as a match', async () => {
    const onChange = vi.fn();
    watchDocument('/root', onChange, {
      signal: controller().signal,
      debounceMs: 5,
      watch: source([{ eventType: 'change', filename: null }]),
    });
    await settle(30);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops on abort with no further calls', async () => {
    const ac = controller();
    const onChange = vi.fn();
    watchDocument('/root', onChange, {
      signal: ac.signal,
      debounceMs: 5,
      // One event, then the generator waits for the abort before yielding another.
      watch: () =>
        (async function* () {
          yield { eventType: 'change', filename: 'worksheets/a.sheet.js' };
          await new Promise<void>((resolve) => ac.signal.addEventListener('abort', () => resolve()));
          yield { eventType: 'change', filename: 'templates/b.mdx' };
        })(),
    });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    ac.abort();
    await settle(30);
    expect(onChange).toHaveBeenCalledTimes(1); // the second event never landed
  });

  it('a synchronously-throwing watch reports onUnavailable and never onChange', async () => {
    const onChange = vi.fn();
    const onUnavailable = vi.fn();
    watchDocument('/root', onChange, {
      signal: controller().signal,
      onUnavailable,
      watch: () => {
        throw new Error('no watch here');
      },
    });
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a rejecting iterator reports onUnavailable and never onChange', async () => {
    const onChange = vi.fn();
    const onUnavailable = vi.fn();
    watchDocument('/root', onChange, {
      signal: controller().signal,
      onUnavailable,
      watch: () => ({
        [Symbol.asyncIterator]() {
          return { next: () => Promise.reject(new Error('broken iterator')) };
        },
      }),
    });
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });
});
