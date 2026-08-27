// The worker-backed async engine (ARCHITECTURE_PLAN §4.1/§4.2) — the host half of the executor
// realm. It owns all scheduling + epoch/breaker state (§4.1: "memo/epoch state lives outside
// the worker"); the worker only executes formulas. Over a `WorkerTransport` it:
//
//   - builds the graph structure from the worker's descriptor and schedules in topo order,
//     resolving inputs through the *shared* `resolveInputs` (one path with the sync Scheduler);
//   - folds tiers (`meetTiers`) and publishes `(value, tier)` per cell with content-key cutoff;
//   - runs a **watchdog** per eval: exceeding the wall-clock budget is a hard runaway — the
//     worker is `terminate()`d + rebuilt and the `CircuitBreaker` counts it; after enough, the
//     cell quarantines and its dependents resolve to the propagated **lattice error** (SES does
//     not protect availability — the breaker + error-as-value are how the engine survives it);
//   - applies **single-slot run-to-completion supersession**: overlapping `update()`s never
//     cancel an in-flight pass; they coalesce into one follow-up with the latest externals, so
//     progress holds even when eval time exceeds the input change rate (no cancel-restart livelock).
//
// GLITCH-FREEDOM (§4.2 C-R-B) is satisfied here **by construction**, not by an explicit
// common-epoch barrier. A pass evaluates cells **sequentially in topo order over one externals
// snapshot**, and passes are **strictly serialized** (single-slot supersession) — so within a
// pass every cell reads inputs derived from a single epoch, and no new epoch starts mid-pass.
// Even on an asymmetric diamond under a continuous feed (a slow arm B, a fast arm C, both under a
// shared ancestor), C cannot race ahead to a newer epoch while B lags: C only runs *after* B in
// the same pass. The freshness cost of that choice is exactly §4.2's stated trade — a cell's
// freshness equals its slowest transitive path. This invariant is proven by the glitch-freedom
// property test (asyncEngine.glitch.test.ts, spec §11 E-2), which watches every settled pass via
// `onPass`. The **per-cell epoch-gate barrier becomes necessary only if concurrent arm evaluation
// is introduced** (the deferred worker-pool partitioning, §4.1) — the single-context serial engine
// does not need it. (An explicit epoch stamp would only add value under that future concurrency.)

import type { Value } from '../stdlib/types.ts';
import type { ExternalValue, PublishedResult } from './types.ts';
import { meetTiers } from './tier.ts';
import { contentKey } from './hash.ts';
import { resolveInputs, FEED_BUFFER_PREFIX } from './resolve.ts';
import { resolversFor } from './graph.ts';
import { CircuitBreaker, DEFAULT_BREAKER } from './circuitBreaker.ts';
import type { BreakerConfig } from './circuitBreaker.ts';
import type { WorkerTransport } from './workerTransport.ts';
import type {
  CellDescriptor,
  SubjectResult,
  SuiteContext,
  TestInputContext,
  TestDescriptor,
  WorkbookDescriptor,
  WorkerResponse,
} from './worker/protocol.ts';

export class TimeoutError extends Error {
  constructor(id: string) {
    super(`evaluation of "${id}" exceeded the budget`);
    this.name = 'TimeoutError';
  }
}

export interface AsyncEngineOptions {
  transport: WorkerTransport;
  /** Per-eval wall-clock budget (ms); exceeding it is a hard runaway. Default 2000. */
  evalBudgetMs?: number;
  breaker?: BreakerConfig;
  /** Injected clock — kept out of ambient so passes are deterministic in tests. */
  now?: () => number;
  /** Injected timer; returns a canceller. Default `setTimeout`/`clearTimeout`. */
  setTimer?: (fn: () => void, ms: number) => () => void;
  /**
   * Observe every settled pass (not just the coalesced final one) — the hook the
   * glitch-freedom property test watches. A pass is internally single-epoch by construction
   * (serial evaluation over one externals snapshot), so this exposes that invariant to a checker.
   */
  onPass?: (pass: AsyncPass) => void;
}

/** The settled state after a pass. */
export interface AsyncPass {
  results: Map<string, PublishedResult>;
  errors: Map<string, string>;
  quarantined: string[];
}

interface PendingEval {
  resolve: (v: Value) => void;
  reject: (e: Error) => void;
}

const defaultTimer = (fn: () => void, ms: number): (() => void) => {
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
};

export class AsyncEngine {
  readonly #transport: WorkerTransport;
  readonly #budget: number;
  readonly #breaker: CircuitBreaker;
  readonly #now: () => number;
  readonly #setTimer: (fn: () => void, ms: number) => () => void;
  readonly #onPass: (pass: AsyncPass) => void;

  #sources: Record<string, string> = {};
  #order: string[] = [];
  #cycles: string[][] = [];
  #nodesById = new Map<string, CellDescriptor>();
  #worksheets = new Map<string, string[]>();

  #results = new Map<string, PublishedResult>();
  #errors = new Map<string, string>();
  #externals = new Map<string, { value: Value; tier: ExternalValue['tier'] }>();
  #tests: WorkbookDescriptor['tests'] = [];

  #pending = new Map<number, PendingEval>();
  #token = 0;
  #buildResolve: ((d: WorkbookDescriptor) => void) | null = null;
  #buildReject: ((e: Error) => void) | null = null;
  #testsPending = new Map<number, { resolve: (r: SubjectResult[]) => void; reject: (e: Error) => void }>();

  // supersession
  #running = false;
  #runningPromise: Promise<AsyncPass> = Promise.resolve(this.#emptyPass());
  #pendingExternals: Map<string, { value: Value; tier: ExternalValue['tier'] }> | null = null;

  constructor(opts: AsyncEngineOptions) {
    this.#transport = opts.transport;
    this.#budget = opts.evalBudgetMs ?? 2000;
    this.#breaker = new CircuitBreaker(opts.breaker ?? DEFAULT_BREAKER);
    this.#now = opts.now ?? (() => Date.now());
    this.#setTimer = opts.setTimer ?? defaultTimer;
    this.#onPass = opts.onPass ?? (() => {});
    this.#transport.onMessage((msg) => this.#onMessage(msg));
  }

  /** Build a fresh engine from worksheet sources over an injected transport. */
  static async fromSources(sources: Record<string, string>, opts: Omit<AsyncEngineOptions, never>): Promise<AsyncEngine> {
    const engine = new AsyncEngine(opts);
    await engine.build(sources);
    return engine;
  }

  /** Send the sources to the worker and adopt the returned graph structure. */
  async build(sources: Record<string, string>): Promise<void> {
    this.#sources = sources;
    this.#applyDescriptor(await this.#sendBuild(sources));
  }

  /** Cold run over the given externals. */
  run(externals: Record<string, ExternalValue>): Promise<AsyncPass> {
    this.#pendingExternals = toMap(externals);
    return this.#drive();
  }

  /** Merge an external delta and recompute (single-slot supersession). */
  update(delta: Record<string, ExternalValue>): Promise<AsyncPass> {
    const base = this.#pendingExternals ?? this.#externals;
    const merged = new Map(base);
    for (const [k, v] of Object.entries(delta)) merged.set(k, { value: v.value, tier: v.tier });
    this.#pendingExternals = merged;
    return this.#drive();
  }

  /** The published result for a cell, if any. */
  result(id: string): PublishedResult | undefined {
    return this.#results.get(id);
  }

  /** The lattice-error message for a cell, if it errored/quarantined. */
  error(id: string): string | undefined {
    return this.#errors.get(id);
  }

  value(id: string): Value | undefined {
    return this.#results.get(id)?.value;
  }

  /**
   * Every external key the workbook reads, with the declaring cell — the input to
   * load-time cross-reference validation (`validateExternalReferences`), so a typo'd
   * feed/fixture name is a diagnostic instead of a silent null.
   */
  externalReferences(): { key: string; site: string }[] {
    const out: { key: string; site: string }[] = [];
    for (const node of this.#nodesById.values()) {
      for (const key of node.externals) out.push({ key, site: node.id });
    }
    return out;
  }

  /** Author re-arm of a quarantined cell (§4.1). */
  rearm(id: string): void {
    this.#breaker.rearm(id);
  }

  /** The workbook's cells (id, worksheet, cell, doc) — the review surface's card data. */
  cells(): readonly CellDescriptor[] {
    return [...this.#nodesById.values()];
  }

  /** The workbook's test cells (kind + subject), sans closures — `runTests` executes them. */
  tests(): readonly TestDescriptor[] {
    return this.#tests;
  }

  /**
   * Run every test suite against the current published state, worker-side (that is where the
   * `expect`/`relation` closures live), and return the review-surface verdict per subject.
   * Subjects without tests are absent from the map (their cells render `untested`).
   *
   * A divergent test wedges the worker the same way a divergent formula does, so this rides
   * a wall-clock budget like `eval`: on timeout the worker is restarted (abandoning the
   * pending suites) and the call rejects — the render pipeline's own watchdog recovery
   * pattern, applied to the review path. The per-cell circuit breaker does not yet count
   * test-run terminations (a booked residual; tests are author code with the same runaway
   * risk, but the failure is contained to the panel).
   */
  runTests(): Promise<Map<string, SubjectResult>> {
    const subjects = [...new Set(this.#tests.map((t) => t.subject))];
    const suites: SuiteContext[] = subjects.map((subject) => ({
      subject,
      subjectValue: this.#results.get(subject)?.value ?? null,
      inputs: this.#inputsFor(subject),
      // R3-373: each test's declared inputs, resolved host-side against the same
      // published state a cell's inputs resolve against. Name-matched entries become
      // substitutions; name-unmatched ones are auxiliary context (oracle fixtures).
      tests: this.#tests.filter((t) => t.subject === subject).map((t) => this.#resolveTestInputs(t)),
    }));
    const token = ++this.#token;
    return new Promise<Map<string, SubjectResult>>((resolve, reject) => {
      const cancel = this.#setTimer(() => {
        this.#testsPending.delete(token);
        this.#transport.restart();
        void this.#sendBuild(this.#sources).catch(() => {
          /* rebuild failure surfaces on the next pass */
        });
        reject(new Error('test run timed out (worker restarted)'));
      }, this.#budget * Math.max(1, suites.length));
      this.#testsPending.set(token, {
        resolve: (r) => {
          cancel();
          resolve(new Map(r.map((s) => [s.subject, s])));
        },
        reject: (e) => {
          cancel();
          reject(e);
        },
      });
      this.#transport.post({ type: 'run-tests', token, suites });
    });
  }

  /** Resolve one cell's inputs from current published state (the run-tests context). */
  #inputsFor(id: string): Record<string, Value> {
    const node = this.#nodesById.get(id);
    if (node === undefined) return {};
    return resolveInputs(node.resolvers, {
      results: this.#results,
      externals: this.#externals,
      worksheets: this.#worksheets,
    }).values;
  }

  /**
   * Resolve one test's declared inputs against published state (R3-373). An unresolvable
   * reference — unknown cell/worksheet (from `resolversFor`), or an external the document
   * has not supplied (absent fixture/feed/param) — is a failing test entry with a message,
   * never a silent `null` substitution.
   */
  #resolveTestInputs(test: WorkbookDescriptor['tests'][number]): TestInputContext {
    const { resolvers, diagnostics } = resolversFor(test.inputs, {
      nodes: this.#nodesById,
      worksheets: this.#worksheets,
    });
    if (diagnostics.length > 0) {
      return { id: test.id, error: diagnostics[0] };
    }
    for (const r of resolvers) {
      if (r.kind === 'external' && !this.#externals.has(r.key)) {
        return { id: test.id, error: `test "${test.id}" input "${r.name}" references absent external "${r.key}".` };
      }
      if (r.kind === 'windowed-feed' && !this.#externals.has(`${FEED_BUFFER_PREFIX}${r.feed}`)) {
        return { id: test.id, error: `test "${test.id}" windowed input "${r.name}" references feed "${r.feed}", which has no retained buffer.` };
      }
    }
    const { values } = resolveInputs(resolvers, {
      results: this.#results,
      externals: this.#externals,
      worksheets: this.#worksheets,
    });
    return { id: test.id, inputs: values };
  }

  snapshot(): AsyncPass {
    return { results: new Map(this.#results), errors: new Map(this.#errors), quarantined: this.#breaker.quarantined() };
  }

  // --- internals -----------------------------------------------------------------

  #emptyPass(): AsyncPass {
    return { results: new Map(), errors: new Map(), quarantined: [] };
  }

  #applyDescriptor(d: WorkbookDescriptor): void {
    this.#order = d.order;
    this.#cycles = d.cycles;
    this.#nodesById = new Map(d.cells.map((c) => [c.id, c]));
    this.#worksheets = new Map(d.worksheets);
    this.#tests = d.tests;
  }

  #onMessage(msg: WorkerResponse): void {
    if (msg.type === 'built') {
      this.#buildResolve?.(msg.descriptor);
      this.#buildResolve = this.#buildReject = null;
    } else if (msg.type === 'build-error') {
      this.#buildReject?.(new Error(msg.message));
      this.#buildResolve = this.#buildReject = null;
    } else if (msg.type === 'test-results') {
      const p = this.#testsPending.get(msg.token);
      if (p === undefined) return;
      this.#testsPending.delete(msg.token);
      p.resolve(msg.suites);
    } else if (msg.type === 'eval-error') {
      // An eval-error can carry a run-tests token (suite machinery threw worker-side).
      const t = this.#testsPending.get(msg.token);
      if (t !== undefined) {
        this.#testsPending.delete(msg.token);
        t.reject(new Error(msg.message));
        return;
      }
      const p = this.#pending.get(msg.token);
      if (p !== undefined) p.reject(new Error(msg.message));
    } else {
      const p = this.#pending.get(msg.token);
      if (p === undefined) return; // superseded / abandoned after a restart
      p.resolve(msg.value);
    }
  }

  #sendBuild(sources: Record<string, string>): Promise<WorkbookDescriptor> {
    return new Promise<WorkbookDescriptor>((resolve, reject) => {
      this.#buildResolve = resolve;
      this.#buildReject = reject;
      this.#transport.post({ type: 'build', sources });
    });
  }

  #drive(): Promise<AsyncPass> {
    if (!this.#running) {
      this.#running = true;
      this.#runningPromise = this.#loop().finally(() => {
        this.#running = false;
      });
    }
    return this.#runningPromise;
  }

  async #loop(): Promise<AsyncPass> {
    let last = this.#emptyPass();
    while (this.#pendingExternals !== null) {
      const externals = this.#pendingExternals;
      this.#pendingExternals = null;
      last = await this.#pass(externals);
    }
    return last;
  }

  async #pass(externals: Map<string, { value: Value; tier: ExternalValue['tier'] }>): Promise<AsyncPass> {
    this.#externals = externals;
    this.#results = new Map();
    this.#errors = new Map();

    if (this.#cycles.length > 0) {
      // A cyclic workbook is unrunnable — and cyclic nodes are excluded from the topo `order`,
      // so error *every* cell, not just the orderable ones.
      const path = this.#cycles.map((c) => c.join(' → ')).join('; ');
      for (const id of this.#nodesById.keys()) this.#errors.set(id, `dependency cycle: ${path}`);
      return this.#settle();
    }

    for (const id of this.#order) {
      const node = this.#nodesById.get(id);
      if (node === undefined) continue;

      if (this.#breaker.isBlocked(id, this.#now())) {
        this.#errors.set(id, 'quarantined (circuit breaker)');
        continue;
      }
      const erroredDep = node.deps.find((d) => this.#errors.has(d));
      if (erroredDep !== undefined) {
        this.#errors.set(id, `input "${erroredDep}" errored`);
        continue;
      }

      const { values, tiers } = resolveInputs(node.resolvers, {
        results: this.#results,
        externals: this.#externals,
        worksheets: this.#worksheets,
      });

      try {
        const value = await this.#evalWithWatchdog(id, values);
        this.#publish(id, value, meetTiers(tiers));
      } catch (e) {
        if (e instanceof TimeoutError) {
          // Hard runaway: kill the wedged worker, rebuild it, and count toward the breaker.
          this.#transport.restart();
          this.#breaker.hardTermination(id, this.#now());
          try {
            await this.#sendBuild(this.#sources);
          } catch {
            /* rebuild failure surfaces on the next pass; this cell is already errored */
          }
          this.#errors.set(id, 'evaluation timed out (terminated)');
        } else {
          // Formula threw — a deterministic lattice error, not a runaway (worker is fine).
          this.#errors.set(id, (e as Error).message);
        }
      }
    }
    return this.#settle();
  }

  /** Snapshot the settled pass and notify the observer (every pass, not just the coalesced last). */
  #settle(): AsyncPass {
    const pass = this.snapshot();
    this.#onPass(pass);
    return pass;
  }

  #evalWithWatchdog(id: string, inputs: Record<string, Value>): Promise<Value> {
    const token = ++this.#token;
    return new Promise<Value>((resolve, reject) => {
      let cancel = (): void => {};
      const settle = <T>(fn: (arg: T) => void) => (arg: T): void => {
        cancel();
        this.#pending.delete(token);
        fn(arg);
      };
      this.#pending.set(token, { resolve: settle(resolve), reject: settle(reject) });
      cancel = this.#setTimer(() => {
        this.#pending.delete(token);
        reject(new TimeoutError(id));
      }, this.#budget);
      this.#transport.post({ type: 'eval', id, token, inputs });
    });
  }

  #publish(id: string, value: Value, tier: ExternalValue['tier']): void {
    this.#results.set(id, { id, value, tier, key: contentKey(value) });
  }
}

function toMap(externals: Record<string, ExternalValue>): Map<string, { value: Value; tier: ExternalValue['tier'] }> {
  return new Map(Object.entries(externals).map(([k, v]) => [k, { value: v.value, tier: v.tier }]));
}
