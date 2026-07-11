// Small validation helpers for the document parsers. Not part of the public surface.

import type { Value } from '../stdlib/types.ts';
import { satisfies } from './semver.ts';

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function requireObject(v: unknown, what: string): Record<string, unknown> {
  if (!isPlainObject(v)) throw new Error(`${what} must be a JSON object.`);
  return v;
}

export function requireString(obj: Record<string, unknown>, key: string, what: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${what}: "${key}" must be a non-empty string.`);
  }
  return v;
}

export function optionalString(obj: Record<string, unknown>, key: string, what: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new Error(`${what}: "${key}" must be a string.`);
  return v;
}

export function optionalInteger(obj: Record<string, unknown>, key: string, what: string): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`${what}: "${key}" must be an integer.`);
  }
  return v;
}

/** Validate a `compat` semver range string (e.g. ">=1.4 <2") by exercising the matcher. */
export function requireRange(obj: Record<string, unknown>, key: string, what: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new Error(`${what}: "${key}" must be a semver range string.`);
  try {
    satisfies('1.0.0', v);
  } catch {
    throw new Error(`${what}: "${key}" is not a valid semver range: ${JSON.stringify(v)}`);
  }
  return v;
}

/** JSON parse with the file name in the error message. */
export function parseJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${file}: invalid JSON (${(e as Error).message}).`);
  }
}

/** A JSON value is already a plain `Value`; this just narrows the type for row/param stores. */
export function asValue(v: unknown): Value {
  return v as Value;
}
