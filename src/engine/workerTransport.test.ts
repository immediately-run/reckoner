// dispose() — terminate without respawn (WHATIF_SHADOW_EVALUATION_SPEC §2.2, G-WIF-7):
// a disposed transport delivers no further messages and drops subsequent posts, so a
// discarded shadow context stops instead of restarting forever.
import { describe, expect, it } from 'vitest';
import { inMemoryTransport } from './workerTransport.ts';
import type { WorkerResponse } from './worker/protocol.ts';

const SHEET = `export const one = cell({ doc: "the number one", formula: () => 1 });`;

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('inMemoryTransport.dispose (G-WIF-7)', () => {
  it('delivers nothing after dispose — including replies already in flight', async () => {
    const transport = inMemoryTransport();
    const seen: WorkerResponse[] = [];
    transport.onMessage((m) => seen.push(m));

    transport.post({ type: 'build', sources: { s: SHEET } });
    await flush();
    expect(seen.map((m) => m.type)).toEqual(['built']);

    // A reply queued before dispose must not land after it.
    transport.post({ type: 'build', sources: { s: SHEET } });
    transport.dispose();
    await flush();
    expect(seen.length).toBe(1);

    // Posts after dispose are dropped outright.
    transport.post({ type: 'build', sources: { s: SHEET } });
    await flush();
    expect(seen.length).toBe(1);
  });
});
