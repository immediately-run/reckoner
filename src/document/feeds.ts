// Parse + validate a `feeds/*.feed.json` connector config (ARCHITECTURE_PLAN §3.4). Feed
// config is *trusted configuration*, not content — but it must never carry a secret value:
// authentication is a `secretRef` (a reference the host resolves), never an inline key
// (§8 credential rule). A config that inlines a secret is rejected outright.

import type { FeedAuth, FeedConfig, FeedRetention } from './types.ts';
import { isPlainObject, optionalString, requireObject } from './internal.ts';

const RAW_SECRET_KEYS = ['secret', 'token', 'key', 'apiKey', 'password', 'bearer'];

/** Parse a feed config from an already-parsed JSON value. Throws on anything malformed. */
export function parseFeedConfig(json: unknown, what = 'feed config'): FeedConfig {
  const obj = requireObject(json, what);

  const source = obj.source;
  const validSource =
    (typeof source === 'string' && source.length > 0) ||
    (Array.isArray(source) && source.length > 0 && source.every((s) => typeof s === 'string' && s.length > 0));
  if (!validSource) {
    throw new Error(`${what}: "source" must be a non-empty URL string or array of URL strings.`);
  }

  const mode = obj.mode;
  if (mode !== 'poll' && mode !== 'subscribe') {
    throw new Error(`${what}: "mode" must be "poll" or "subscribe".`);
  }

  return {
    source: source as string | string[],
    mode,
    auth: parseAuth(obj.auth, what),
    schedule: optionalString(obj, 'schedule', what),
    retention: parseRetention(obj.retention, what),
    conflation: optionalString(obj, 'conflation', what),
  };
}

function parseAuth(raw: unknown, what: string): FeedAuth | undefined {
  if (raw === undefined) return undefined;
  const obj = requireObject(raw, `${what}.auth`);
  for (const k of RAW_SECRET_KEYS) {
    if (k in obj) {
      throw new Error(
        `${what}.auth: inline secret "${k}" is forbidden — reference a user-held secret via "secretRef" instead.`,
      );
    }
  }
  const secretRef = obj.secretRef;
  if (typeof secretRef !== 'string' || secretRef.length === 0) {
    throw new Error(`${what}.auth: "secretRef" must be a non-empty reference string.`);
  }
  return { secretRef };
}

function parseRetention(raw: unknown, what: string): FeedRetention | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) throw new Error(`${what}.retention must be an object.`);
  const retention: FeedRetention = {};
  if (raw.keepLast !== undefined) {
    if (typeof raw.keepLast !== 'number' || !Number.isInteger(raw.keepLast) || raw.keepLast < 0) {
      throw new Error(`${what}.retention.keepLast must be a non-negative integer.`);
    }
    retention.keepLast = raw.keepLast;
  }
  retention.keepFor = optionalString(raw, 'keepFor', `${what}.retention`);
  return retention;
}
