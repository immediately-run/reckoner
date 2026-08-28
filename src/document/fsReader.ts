// A DocumentReader over the sandbox `fs` port (src/document/types.ts) — the reader the
// dispatched flow uses: a workbook that arrived as a content mount is plain files on
// the filesystem, and `loadDocument` reads through this exactly as it reads the
// bundled seed through memoryReader. The `fs` module is the platform's bridged port
// (async only — `fs.promises.*`), available in the sandbox and via @immediately-run/dev-fs
// under vite dev.

import fs from 'fs';
import type { DocumentReader } from './types.ts';

/**
 * Read a document rooted at an absolute sandbox path (a dispatched content mount's
 * root). Paths arrive already joined by `loadDocument` (root + '/' + rel), so this is
 * a thin normalization + read; a missing file/dir throws, which the loader turns into
 * a per-file skip/diagnostic.
 */
export function fsReader(): DocumentReader {
  const norm = (p: string): string => (p.startsWith('/') ? p : `/${p}`);
  return {
    async readFile(path) {
      return await fs.promises.readFile(norm(path), 'utf8');
    },
    async readDir(dir) {
      return await fs.promises.readdir(norm(dir));
    },
  };
}
