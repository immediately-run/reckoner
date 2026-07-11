// A deliberately minimal semver matcher for the compatibility envelope
// (DOCUMENT_VERSIONING_SPEC §1/§2). It supports exactly what `compat` ranges use — a
// conjunction of comparators (`>=1.4 <2`) over `major.minor.patch` — not the full semver
// grammar (no `^`/`~`/`||`/pre-release tags). Keeping it small and pure avoids pulling a
// semver runtime into the sandbox bundle; the envelope's ranges are simple by design.

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

/** Parse "1", "1.4", or "1.4.2" into a {@link SemVer}. Throws on anything malformed. */
export function parseVersion(v: string): SemVer {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(v.trim());
  if (!m) throw new Error(`Invalid version: ${JSON.stringify(v)}`);
  return {
    major: Number(m[1]),
    minor: m[2] !== undefined ? Number(m[2]) : 0,
    patch: m[3] !== undefined ? Number(m[3]) : 0,
  };
}

/** Order two versions: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string | SemVer, b: string | SemVer): number {
  const pa = typeof a === 'string' ? parseVersion(a) : a;
  const pb = typeof b === 'string' ? parseVersion(b) : b;
  return pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch;
}

type Op = '>=' | '<=' | '>' | '<' | '=';

const OPS: Op[] = ['>=', '<=', '>', '<', '='];

function comparator(token: string): (v: SemVer) => boolean {
  let op: Op = '=';
  let rest = token;
  for (const o of OPS) {
    if (token.startsWith(o)) {
      op = o;
      rest = token.slice(o.length);
      break;
    }
  }
  const bound = parseVersion(rest);
  return (v: SemVer) => {
    const c = compareVersions(v, bound);
    switch (op) {
      case '>=':
        return c >= 0;
      case '<=':
        return c <= 0;
      case '>':
        return c > 0;
      case '<':
        return c < 0;
      case '=':
        return c === 0;
    }
  };
}

/**
 * True when `version` satisfies every space-separated comparator in `range`
 * (e.g. `">=1.4 <2"`). An empty range is satisfied by anything.
 */
export function satisfies(version: string | SemVer, range: string): boolean {
  const v = typeof version === 'string' ? parseVersion(version) : version;
  const tokens = range.trim().split(/\s+/).filter((t) => t.length > 0);
  return tokens.every((t) => comparator(t)(v));
}
