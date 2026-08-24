// Platform guards: source-level invariants that only fail on immediately.run (the
// "works in vite dev, breaks on the platform" trap). Vitest runs in Node; these read the
// repo's own source and fail loudly at test time, not in a user's browser.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Modules exempt from each guard, with the reason each is safe. */
const IMPORT_META_EXEMPT = new Set([
  // vite-only dev entry — the platform never loads it (entry is App.tsx's default export).
  'src/main.tsx',
  // the one sanctioned home of import.meta.url, reached only via dynamic import inside
  // makeTransport's try/catch, so its parse failure on the platform is catchable.
  'src/app/workerUrl.ts',
]);

function* tsFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* tsFiles(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield p;
  }
}

/** Strip line + block comments (crude but sufficient: we only need to not match prose). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
}

describe('the immediately.run compatibility guards', () => {
  it('no module the platform loads contains import.meta (outside the two exempt files)', () => {
    const offenders: string[] = [];
    for (const path of tsFiles(join(process.cwd(), 'src'))) {
      // Normalize to the repo-relative `src/...` path (the walker yields absolute paths).
      const relFromSrc = `src/${path.split(/[/\\]src[/\\]/)[1]?.replace(/\\/g, '/') ?? ''}`;
      if (IMPORT_META_EXEMPT.has(relFromSrc)) continue;
      if (/import\.meta/.test(withoutComments(readFileSync(path, 'utf8')))) offenders.push(relFromSrc);
    }
    // Rationale: the platform transpiles ESM→CJS and evaluates classic scripts, where
    // import.meta is a parse-time SyntaxError that kills the whole module — caught live on
    // 2026-08-24 when the reckoner demo first ran on production.
    expect(offenders).toEqual([]);
  });
});
