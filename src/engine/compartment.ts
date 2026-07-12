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

const STDLIB_IMPORT = /^\s*import\s+[^;]*from\s+['"]@reckoner\/stdlib['"];?\s*$/gm;
const EXPORT_CONST = /export\s+const\s+(\w+)/g;

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
  const body = source.replace(STDLIB_IMPORT, '').replace(/export\s+const\s+/g, 'const ');

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
