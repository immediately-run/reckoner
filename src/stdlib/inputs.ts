// Input-spec parsing (ARCHITECTURE_PLAN §3.1). A cell's `inputs` map is the *only* way
// it sees data, and it is what the engine reads to extract the dependency graph
// (names + declared inputs only, no values). This module turns each declared input into
// a normalized {@link InputSpec} the scheduler, taint fold, and test runner consume.
//
// An input path uses one of five namespaces: the four reserved data namespaces
// `feeds.* / fixtures.* / static.* / params.*`, or a `<worksheet>.<cell>` reference
// (any head that is not a reserved namespace). `<worksheet>.*` is the declared-namespace
// indirection (the Shake/Bazel treatment) — never Excel's volatile `INDIRECT()`.

export type Namespace = 'feeds' | 'fixtures' | 'static' | 'params' | 'worksheet';

/** The object form of an input: an event-time window over a feed's buffer. */
export interface WindowedFeed {
  feed: string;
  window?: string;
}

export interface InputSpec {
  /** The declaration as written, for diagnostics. */
  raw: string | WindowedFeed;
  namespace: Namespace;
  /** Path segments after the namespace head, e.g. `feeds.orders.meta.fetched_at` → `['orders','meta','fetched_at']`. */
  segments: string[];
  /** Set when `namespace === 'worksheet'`. */
  worksheet?: string;
  /** A single referenced cell, when the path is `<worksheet>.<cell>`. */
  cell?: string;
  /** True for `<worksheet>.*` declared-namespace indirection. */
  wildcard: boolean;
  /** Set for the windowed-feed object form. */
  feed?: string;
  window?: string;
  /**
   * The coarse dependency key for the scheduler: the reserved `namespace.name`
   * (`feeds.orders`), a single cell (`revenue.by_month`), or the conservative
   * namespace (`revenue.*`) for a wildcard.
   */
  dependency: string;
}

const RESERVED: ReadonlySet<string> = new Set(['feeds', 'fixtures', 'static', 'params']);

function isWindowedFeed(spec: unknown): spec is WindowedFeed {
  return typeof spec === 'object' && spec !== null && typeof (spec as WindowedFeed).feed === 'string';
}

/** Parse one declared input value into a normalized {@link InputSpec}. */
export function parseInput(spec: string | WindowedFeed): InputSpec {
  if (isWindowedFeed(spec)) {
    if (spec.feed.length === 0) throw new Error('Windowed input requires a non-empty `feed`.');
    return {
      raw: spec,
      namespace: 'feeds',
      segments: [spec.feed],
      wildcard: false,
      feed: spec.feed,
      window: spec.window,
      dependency: `feeds.${spec.feed}`,
    };
  }

  if (typeof spec !== 'string' || spec.length === 0) {
    throw new Error(`Invalid input spec: ${JSON.stringify(spec)}`);
  }

  const segments = spec.split('.');
  const head = segments[0];
  const rest = segments.slice(1);
  if (head.length === 0 || rest.length === 0 || rest.some((s) => s.length === 0)) {
    throw new Error(`Malformed input path: ${JSON.stringify(spec)}`);
  }

  if (RESERVED.has(head)) {
    if (rest.includes('*')) {
      throw new Error(`Cannot wildcard a reserved namespace: ${JSON.stringify(spec)}`);
    }
    return {
      raw: spec,
      namespace: head as Namespace,
      segments: rest,
      wildcard: false,
      dependency: `${head}.${rest[0]}`,
    };
  }

  // Worksheet reference: exactly `<worksheet>.<cell>` or `<worksheet>.*`.
  if (rest.length !== 1) {
    throw new Error(
      `A worksheet reference must be "<worksheet>.<cell>" or "<worksheet>.*": ${JSON.stringify(spec)}`,
    );
  }
  const tail = rest[0];
  if (tail === '*') {
    return {
      raw: spec,
      namespace: 'worksheet',
      segments: rest,
      worksheet: head,
      wildcard: true,
      dependency: `${head}.*`,
    };
  }
  return {
    raw: spec,
    namespace: 'worksheet',
    segments: rest,
    worksheet: head,
    cell: tail,
    wildcard: false,
    dependency: `${head}.${tail}`,
  };
}

/** Parse every value of an `inputs` map, preserving the local names. */
export function normalizeInputs(
  inputs: Record<string, string | WindowedFeed>,
): Record<string, InputSpec> {
  const out: Record<string, InputSpec> = {};
  for (const [name, spec] of Object.entries(inputs)) out[name] = parseInput(spec);
  return out;
}

/** The deduped coarse dependency keys of an `inputs` map, in first-seen order. */
export function dependencies(inputs: Record<string, string | WindowedFeed>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const spec of Object.values(inputs)) {
    const dep = parseInput(spec).dependency;
    if (!seen.has(dep)) {
      seen.add(dep);
      out.push(dep);
    }
  }
  return out;
}
