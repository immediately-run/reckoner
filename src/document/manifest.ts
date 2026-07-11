// Parse + validate `reckoner.json` (ARCHITECTURE_PLAN §3; DOCUMENT_VERSIONING_SPEC §1).
// A malformed manifest is fatal — the loader cannot proceed without it — so this throws
// rather than returning diagnostics.

import type { Value } from '../stdlib/types.ts';
import type { AuthoredWith, CompatBlock, ReckonerManifest } from './types.ts';
import {
  asValue,
  isPlainObject,
  optionalInteger,
  optionalString,
  requireObject,
  requireRange,
} from './internal.ts';

const WHAT = 'reckoner.json';

/** Parse a manifest from an already-parsed JSON value. */
export function parseManifest(json: unknown): ReckonerManifest {
  const obj = requireObject(json, WHAT);

  const format = obj.format;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) {
    throw new Error(`${WHAT}: "format" must be a positive integer.`);
  }

  const compat = parseCompat(obj.compat);
  const authoredWith = parseAuthoredWith(obj.authoredWith);

  if (!Array.isArray(obj.worksheets) || obj.worksheets.some((w) => typeof w !== 'string' || w.length === 0)) {
    throw new Error(`${WHAT}: "worksheets" must be an array of non-empty file names (ordered).`);
  }
  const worksheets = obj.worksheets as string[];

  let params: Record<string, Value> = {};
  if (obj.params !== undefined) {
    if (!isPlainObject(obj.params)) throw new Error(`${WHAT}: "params" must be an object of default values.`);
    params = Object.fromEntries(Object.entries(obj.params).map(([k, v]) => [k, asValue(v)]));
  }

  return {
    format,
    compat,
    authoredWith,
    worksheets,
    params,
    title: optionalString(obj, 'title', WHAT),
  };
}

function parseCompat(raw: unknown): CompatBlock {
  if (raw === undefined) return {};
  const obj = requireObject(raw, `${WHAT}.compat`);
  return {
    stdlib: requireRange(obj, 'stdlib', `${WHAT}.compat`),
    catalog: requireRange(obj, 'catalog', `${WHAT}.compat`),
    tierTag: optionalInteger(obj, 'tierTag', `${WHAT}.compat`),
  };
}

function parseAuthoredWith(raw: unknown): AuthoredWith | undefined {
  if (raw === undefined) return undefined;
  const obj = requireObject(raw, `${WHAT}.authoredWith`);
  return {
    app: optionalString(obj, 'app', `${WHAT}.authoredWith`),
    stdlib: optionalString(obj, 'stdlib', `${WHAT}.authoredWith`),
    catalog: optionalString(obj, 'catalog', `${WHAT}.authoredWith`),
  };
}
