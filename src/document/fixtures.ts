// Parse + validate a `fixtures/*.frame.json` frozen frame (ARCHITECTURE_PLAN §3.4). A
// fixture is captured rows plus provenance (source feed, captured-at, actor) and the
// frame's tier tag at capture. The in-file `tier` is advisory display metadata only — the
// host's mount tier is authoritative (§5.4), so nothing here trusts it for enforcement.

import type { Row } from '../stdlib/types.ts';
import type { FixtureFrame, FixtureProvenance } from './types.ts';
import { isPlainObject, optionalString, requireObject } from './internal.ts';

/** Parse a fixture frame from an already-parsed JSON value. Throws on anything malformed. */
export function parseFixtureFrame(json: unknown, what = 'fixture frame'): FixtureFrame {
  const obj = requireObject(json, what);

  if (!Array.isArray(obj.rows) || obj.rows.some((r) => !isPlainObject(r))) {
    throw new Error(`${what}: "rows" must be an array of row objects.`);
  }
  const rows = obj.rows as Row[];

  return {
    rows,
    provenance: parseProvenance(obj.provenance, what),
    tier: optionalString(obj, 'tier', what),
  };
}

function parseProvenance(raw: unknown, what: string): FixtureProvenance {
  if (raw === undefined) return {};
  const obj = requireObject(raw, `${what}.provenance`);
  const provenance: FixtureProvenance = {
    sourceFeed: optionalString(obj, 'sourceFeed', `${what}.provenance`),
    capturedAt: optionalString(obj, 'capturedAt', `${what}.provenance`),
    captureActor: optionalString(obj, 'captureActor', `${what}.provenance`),
  };
  if (obj.synthetic !== undefined) {
    if (typeof obj.synthetic !== 'boolean') {
      throw new Error(`${what}.provenance.synthetic must be a boolean.`);
    }
    provenance.synthetic = obj.synthetic;
  }
  return provenance;
}
