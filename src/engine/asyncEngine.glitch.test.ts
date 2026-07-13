import { describe, expect, it } from 'vitest';
import { AsyncEngine } from './asyncEngine.ts';
import { createEngineWorker } from './worker/engineWorker.ts';
import type { WorkerTransport } from './workerTransport.ts';
import type { WorkerResponse } from './worker/protocol.ts';
import type { ExternalValue } from './types.ts';
import type { AsyncPass } from './asyncEngine.ts';

// Glitch-freedom (ARCHITECTURE_PLAN §4.2 C-R-B, spec §11 E-2). The serial single-context engine
// is glitch-free by construction: a pass evaluates cells sequentially over one externals epoch,
// and passes are serialized — so no cell ever assembles inputs from two epochs, even on an
// asymmetric diamond under a continuous feed. This proves it by watching EVERY settled pass and
// asserting no published cell mixes epochs. Each source cell reports `[epoch]`; a derived cell
// concatenates its inputs' epoch lists — so a mixed-epoch cell is one whose list has >1 distinct
// value.

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A transport that runs the real worker but delays each cell's eval response by `delays[id]` ms. */
function delayingTransport(delays: Record<string, number>): WorkerTransport {
  let worker = createEngineWorker();
  let handler: (m: WorkerResponse) => void = () => {};
  return {
    post(msg) {
      if (msg.type === 'build') {
        try {
          handler({ type: 'built', descriptor: worker.build(msg.sources) });
        } catch (e) {
          handler({ type: 'build-error', message: (e as Error).message });
        }
        return;
      }
      const run = (): void =>
        void Promise.resolve()
          .then(() => worker.eval(msg.id, msg.inputs))
          .then((value) => handler({ type: 'result', token: msg.token, id: msg.id, value }))
          .catch((e) => handler({ type: 'eval-error', token: msg.token, id: msg.id, message: (e as Error).message }));
      const d = delays[msg.id] ?? 0;
      if (d > 0) setTimeout(run, d);
      else run();
    },
    onMessage(h) {
      handler = h;
    },
    restart() {
      worker = createEngineWorker();
    },
  };
}

/** Every distinct epoch a cell's value (an epoch list) was assembled from. */
function epochsOf(value: unknown): number[] {
  return Array.isArray(value) ? [...new Set(value as number[])] : [];
}

/** Assert every published cell in every observed pass came from a single epoch. */
function assertNoGlitch(passes: AsyncPass[]): void {
  for (const pass of passes) {
    for (const [id, result] of pass.results) {
      const epochs = epochsOf(result.value);
      expect(epochs.length, `cell ${id} mixed epochs ${epochs.join('/')}`).toBeLessThanOrEqual(1);
    }
  }
}

const tick = (epoch: number): ExternalValue => ({ value: [epoch] as unknown as ExternalValue['value'], tier: 'live' });

describe('AsyncEngine glitch-freedom', () => {
  it('an asymmetric diamond under overlapping updates never publishes a mixed-epoch cell', async () => {
    // a → b (slow) and a → c (fast); d = b + c. The classic glitch shape.
    const sources = {
      s: `import { cell } from "@reckoner/stdlib";
export const a = cell({ doc: "source", inputs: { t: "feeds.tick" }, formula: ({ t }) => t });
export const b = cell({ doc: "slow arm", inputs: { a: "s.a" }, formula: ({ a }) => a });
export const c = cell({ doc: "fast arm", inputs: { a: "s.a" }, formula: ({ a }) => a });
export const d = cell({ doc: "join", inputs: { b: "s.b", c: "s.c" }, formula: ({ b, c }) => [...b, ...c] });
`,
    };
    const passes: AsyncPass[] = [];
    const engine = await AsyncEngine.fromSources(sources, {
      transport: delayingTransport({ 's.b': 40, 's.c': 3 }), // b evaluates far slower than c
      onPass: (p) => passes.push(p),
    });

    const done = engine.run({ 'feeds.tick': tick(1) });
    await sleep(8);
    engine.update({ 'feeds.tick': tick(2) }); // arrives while the slow arm of pass 1 grinds
    await sleep(8);
    engine.update({ 'feeds.tick': tick(3) });
    await done;

    assertNoGlitch(passes);
    // The scenario is real: a later epoch superseded the first mid-pass, so >1 pass settled and
    // the final value advanced — a glitch, had one occurred, would have been caught above.
    expect(passes.length).toBeGreaterThanOrEqual(2);
    expect(engine.value('s.d')).toEqual([3, 3]); // settles at the latest epoch, consistent
  });

  it('property: random DAGs with random arm delays stay glitch-free under a bursty feed', async () => {
    // Deterministic PRNG (no ambient Date/Math.random) so failures reproduce.
    let seed = 0x9e3779b9;
    const rnd = (): number => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (n: number): number => Math.floor(rnd() * n);

    for (let trial = 0; trial < 6; trial++) {
      const n = 5 + pick(4); // 5–8 cells
      const lines: string[] = ['import { cell } from "@reckoner/stdlib";'];
      const delays: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        const id = `w.c${i}`;
        delays[id] = pick(4) === 0 ? 10 + pick(30) : 0; // ~25% of cells are slow arms
        if (i === 0) {
          lines.push(`export const c0 = cell({ doc: "src", inputs: { t: "feeds.tick" }, formula: ({ t }) => t });`);
        } else {
          const k = 1 + pick(Math.min(2, i)); // 1–2 inputs from earlier cells
          const chosen = new Set<number>();
          while (chosen.size < k) chosen.add(pick(i));
          const inputs = [...chosen].map((j, idx) => `i${idx}: "w.c${j}"`).join(', ');
          const spread = [...chosen].map((_, idx) => `...i${idx}`).join(', ');
          lines.push(`export const c${i} = cell({ doc: "d", inputs: { ${inputs} }, formula: ({ ${[...chosen].map((_, idx) => `i${idx}`).join(', ')} }) => [${spread}] });`);
        }
      }
      const passes: AsyncPass[] = [];
      const engine = await AsyncEngine.fromSources({ w: lines.join('\n') }, { transport: delayingTransport(delays), onPass: (p) => passes.push(p) });

      const done = engine.run({ 'feeds.tick': tick(1) });
      for (let e = 2; e <= 4; e++) {
        await sleep(6);
        engine.update({ 'feeds.tick': tick(e) });
      }
      await done;

      assertNoGlitch(passes);
      expect(passes.length, `trial ${trial} produced no passes`).toBeGreaterThan(0);
    }
  });
});
