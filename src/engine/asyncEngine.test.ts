import { describe, expect, it } from 'vitest';
import { AsyncEngine } from './asyncEngine.ts';
import { Engine } from './engine.ts';
import { inMemoryTransport } from './workerTransport.ts';
import { createEngineWorker } from './worker/engineWorker.ts';
import type { WorkerTransport } from './workerTransport.ts';
import type { WorkerResponse } from './worker/protocol.ts';
import type { ExternalValue } from './types.ts';
import * as stdlib from '../stdlib/index.ts';

const SOURCES = {
  sheet: `import { cell } from "@reckoner/stdlib";
export const total = cell({ doc: "sum rows", inputs: { rows: "fixtures.data" }, formula: ({ rows }) => rows.reduce((a, r) => a + r.v, 0) });
export const scaled = cell({ doc: "scale by k", inputs: { t: "sheet.total", k: "params.k" }, formula: ({ t, k }) => t * k });
`,
};
const EXTERNALS: Record<string, ExternalValue> = {
  'fixtures.data': { value: [{ v: 1 }, { v: 2 }, { v: 3 }], tier: 'static' },
  'params.k': { value: 2, tier: 'static' },
};

// A controllable transport: runs the real worker body in-process, but can withhold a cell's
// response (a wedged worker, for the watchdog) or delay responses (for supersession), and
// counts restarts + eval posts.
function makeTransport(opts: { stuck?: Set<string>; evalDelayMs?: number } = {}): {
  transport: WorkerTransport;
  restarts: () => number;
  evalPosts: () => number;
} {
  let worker = createEngineWorker();
  let handler: (m: WorkerResponse) => void = () => {};
  let restarts = 0;
  let evalPosts = 0;
  return {
    transport: {
      post(msg) {
        if (msg.type === 'build') {
          try {
            handler({ type: 'built', descriptor: worker.build(msg.sources) });
          } catch (e) {
            handler({ type: 'build-error', message: (e as Error).message });
          }
          return;
        }
        evalPosts++;
        if (opts.stuck?.has(msg.id)) return; // withhold → the host watchdog must fire
        const run = (): void => {
          Promise.resolve()
            .then(() => worker.eval(msg.id, msg.inputs))
            .then((value) => handler({ type: 'result', token: msg.token, id: msg.id, value }))
            .catch((e) => handler({ type: 'eval-error', token: msg.token, id: msg.id, message: (e as Error).message }));
        };
        if (opts.evalDelayMs) setTimeout(run, opts.evalDelayMs);
        else run();
      },
      onMessage(h) {
        handler = h;
      },
      restart() {
        restarts++;
        worker = createEngineWorker();
      },
    },
    restarts: () => restarts,
    evalPosts: () => evalPosts,
  };
}

describe('AsyncEngine', () => {
  it('computes the same results as the sync Engine over the worker', async () => {
    const engine = await AsyncEngine.fromSources(SOURCES, { transport: inMemoryTransport() });
    const pass = await engine.run(EXTERNALS);

    const sync = Engine.fromSources(SOURCES, { ...stdlib });
    sync.run(EXTERNALS);

    expect(engine.value('sheet.total')).toBe(6);
    expect(engine.value('sheet.scaled')).toBe(12);
    expect(engine.value('sheet.total')).toBe(sync.value('sheet.total'));
    expect(engine.value('sheet.scaled')).toBe(sync.value('sheet.scaled'));
    expect(pass.results.get('sheet.scaled')?.tier).toBe('static');
    expect(pass.errors.size).toBe(0);
  });

  it('propagates a thrown formula as a lattice error to dependents', async () => {
    const sources = {
      sheet: `import { cell } from "@reckoner/stdlib";
export const boom = cell({ doc: "throws", inputs: {}, formula: () => { throw new Error("kaboom"); } });
export const useBoom = cell({ doc: "uses boom", inputs: { b: "sheet.boom" }, formula: ({ b }) => b });
`,
    };
    const engine = await AsyncEngine.fromSources(sources, { transport: inMemoryTransport() });
    await engine.run({});
    expect(engine.error('sheet.boom')).toMatch(/kaboom/);
    expect(engine.error('sheet.useBoom')).toMatch(/input "sheet.boom" errored/);
    expect(engine.value('sheet.useBoom')).toBeUndefined();
  });

  it('reports a dependency cycle as an error on every cell', async () => {
    const sources = {
      s: `import { cell } from "@reckoner/stdlib";
export const a = cell({ doc: "a", inputs: { b: "s.b" }, formula: ({ b }) => b });
export const b = cell({ doc: "b", inputs: { a: "s.a" }, formula: ({ a }) => a });
`,
    };
    const engine = await AsyncEngine.fromSources(sources, { transport: inMemoryTransport() });
    const pass = await engine.run({});
    expect(pass.errors.get('s.a')).toMatch(/cycle/);
    expect(pass.errors.get('s.b')).toMatch(/cycle/);
  });

  it('watchdog: a wedged cell times out → terminate + rebuild + quarantine → dependents error', async () => {
    const ctl = makeTransport({ stuck: new Set(['sheet.total']) });
    const engine = await AsyncEngine.fromSources(SOURCES, {
      transport: ctl.transport,
      evalBudgetMs: 15,
      breaker: { hardLimit: 1, windowMs: 1000, softSuppressMs: 100 },
    });
    const pass = await engine.run(EXTERNALS);

    expect(ctl.restarts()).toBe(1); // the wedged worker was terminated + rebuilt
    expect(engine.error('sheet.total')).toMatch(/timed out/);
    expect(pass.quarantined).toContain('sheet.total');
    expect(engine.error('sheet.scaled')).toMatch(/errored/); // dependent gets the lattice error

    // Re-arm clears the quarantine; a fresh worker (nothing wedged) settles normally — proving
    // the engine recovers rather than staying permanently broken.
    engine.rearm('sheet.total');
    const engine2 = await AsyncEngine.fromSources(SOURCES, { transport: inMemoryTransport() });
    await engine2.run(EXTERNALS);
    expect(engine2.value('sheet.total')).toBe(6);
  });

  it('single-slot supersession: overlapping updates coalesce into one follow-up pass', async () => {
    const ctl = makeTransport({ evalDelayMs: 10 });
    const engine = await AsyncEngine.fromSources(SOURCES, { transport: ctl.transport });

    const p1 = engine.run(EXTERNALS); // pass 1 in flight (delayed)
    engine.update({ 'params.k': { value: 5, tier: 'static' } }); // superseded before it runs
    const p3 = engine.update({ 'params.k': { value: 7, tier: 'static' } }); // the survivor
    await Promise.all([p1, p3]);

    expect(engine.value('sheet.scaled')).toBe(42); // 6 * 7 (last update won)
    // Two passes only (initial + one coalesced), 2 cells each → 4 eval posts, not 6.
    expect(ctl.evalPosts()).toBe(4);
  });

  it('awaits an async formula (a formula may return a promise)', async () => {
    const sources = {
      sheet: `import { cell } from "@reckoner/stdlib";
export const a = cell({ doc: "async", inputs: { x: "params.x" }, formula: async ({ x }) => x + 100 });
`,
    };
    const engine = await AsyncEngine.fromSources(sources, { transport: inMemoryTransport() });
    await engine.run({ 'params.x': { value: 5, tier: 'static' } });
    expect(engine.value('sheet.a')).toBe(105); // awaited, not a Promise
  });
});
