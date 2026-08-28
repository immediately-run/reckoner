// SES-confined worksheet evaluation (ARCHITECTURE_PLAN §4.1) — the effectful heart of the
// engine realm, proven runnable in-platform by the S5 spike
// (docs/spikes/S5_SES_MODULE_RESOLUTION.md) and here tested in Node with the real `ses`
// package. A worksheet is content: evaluating it *is* content execution, which is exactly
// what this realm exists to do, and it happens inside a Hardened-JavaScript Compartment so
// the worksheet can reach nothing but the stdlib and its injected inputs — no ambient
// `fetch`/`process`/`console`, no Class-B capability, unreachable by construction.
//
// `import 'ses'` installs the `Compartment` global (a side-effect shim). Production runs
// this inside the engine entry-point's worker and calls `lockdown()` there (isolated from
// React); the confinement that matters for evaluation — a fresh compartment global holding
// only the endowments — holds with or without lockdown, so the unit tests exercise the real
// confinement path without freezing the test process's intrinsics.

import 'ses';
import type { Value } from '../stdlib/types.ts';
import type { NodeDef } from './types.ts';

declare const Compartment: new (endowments?: Record<string, unknown>) => {
  evaluate: (source: string) => unknown;
};

// Both regexes are LINE-ANCHORED (WHATIF_SHADOW_EVALUATION_SPEC §3.3, G-WIF-1a): the token
// sequence `export const` inside a formula's single-line string literal or comment must
// neither be rewritten (which would make `formula.toString()` diverge from file text and
// break the what-if splice) nor collect a phantom export name (which would break the
// register call). Residual, accepted: a string literal containing a newline followed by
// `export const` still matches — such a sheet breaks the base build today regardless.
const STDLIB_IMPORT = /^\s*import\s+[^;]*from\s+['"]@reckoner\/stdlib['"];?\s*$/gm;
const EXPORT_CONST = /^\s*export\s+const\s+(\w+)/gm;
const EXPORT_PREFIX = /^(\s*)export\s+const\s+/gm;

/**
 * Evaluate a worksheet module inside a fresh SES Compartment and return its registered
 * cells/tests, keyed by export name. The stdlib is endowed as the compartment's globals
 * (the worksheet's `import … from "@reckoner/stdlib"` is the one import the engine
 * satisfies); every other ambient is absent. Worksheet source is the already-transpiled
 * form (plain JS) the sandbox produces in-platform.
 */
export function evaluateWorksheet(
  source: string,
  stdlib: Record<string, unknown>,
): Record<string, NodeDef> {
  const names = [...source.matchAll(EXPORT_CONST)].map((m) => m[1]);
  const body = source.replace(STDLIB_IMPORT, '').replace(EXPORT_PREFIX, '$1const ');

  let collected: Record<string, unknown> = {};
  const register = (obj: Record<string, unknown>): void => {
    collected = obj;
  };

  const compartment = new Compartment({ ...stdlib, __register: register });
  // The trailing __register call runs in the same script scope, so it captures the consts
  // the worksheet just defined without needing the compartment's full module loader.
  compartment.evaluate(`${body}\n;__register({ ${names.join(', ')} });`);

  const out: Record<string, NodeDef> = {};
  for (const [name, v] of Object.entries(collected)) {
    if (isNodeDef(v)) out[name] = v;
  }
  return out;
}

/** One export's location in the RAW worksheet source (R3-427, WHATIF spec §3.1's successor). */
export interface ExportSpan {
  /** Offset of the `export const` declaration's line start. */
  start: number;
  /** Offset just past the declaration block (the next export's line start, or EOF). */
  end: number;
  /** 1-based line number of the declaration. */
  line: number;
}

/**
 * The declaration-block span of every `export const` in a worksheet source, keyed by
 * export name — computed on the RAW file text with the same line-anchored regex the
 * transform uses (so a formula containing the string `"export const x"` neither splits a
 * block nor mints a phantom span, exactly as it neither mangles nor registers — G-WIF-1a).
 * A block runs from its declaration's line start to the next declaration's line start
 * (or EOF): within one block, a cell's formula text is location-unambiguous even when
 * other cells carry identical text, which is what lets the what-if splice patch by span.
 */
export function exportSpans(source: string): Record<string, ExportSpan> {
  // `^\s*` under /m can consume blank lines BEFORE the declaration, so m.index may sit
  // on an earlier empty line — fine for block bounds (blank lines belong to a boundary),
  // wrong for `line`, which anchors on the `export` keyword itself.
  const matches = [...source.matchAll(EXPORT_CONST)].map((m) => ({
    name: m[1],
    start: m.index,
    keywordAt: m.index + m[0].indexOf('export'),
  }));
  const out: Record<string, ExportSpan> = {};
  for (let i = 0; i < matches.length; i += 1) {
    const { name, start, keywordAt } = matches[i];
    out[name] = {
      start,
      end: i + 1 < matches.length ? matches[i + 1].start : source.length,
      line: source.slice(0, keywordAt).split('\n').length,
    };
  }
  return out;
}

/**
 * Evaluate a plain expression inside a fresh Compartment with the given endowments — the
 * primitive the worksheet evaluator is built on, exposed for substrate tests. Ambient
 * globals are unreachable.
 */
export function evaluateConfined(source: string, endowments: Record<string, unknown> = {}): Value {
  return new Compartment(endowments).evaluate(source) as Value;
}

function isNodeDef(v: unknown): v is NodeDef {
  return (
    typeof v === 'object' &&
    v !== null &&
    ((v as NodeDef).kind === 'cell' || (v as NodeDef).kind === 'test')
  );
}
