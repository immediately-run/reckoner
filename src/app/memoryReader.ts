// An in-memory DocumentReader (src/document/types.ts) over a path→content map. Backs the
// bundled demo document so the real `loadDocument` loader runs unchanged in the app — the same
// port the loader's unit tests use. A missing file throws (the loader turns a per-file throw
// into a skip/diagnostic); an empty directory throws too (the loader treats that as "no such
// dir", i.e. no feeds/fixtures).

import type { DocumentReader } from '../document/types.ts';

export function memoryReader(files: Record<string, string>): DocumentReader {
  return {
    async readFile(path) {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    async readDir(dir) {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      const names = new Set<string>();
      for (const path of Object.keys(files)) {
        if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split('/')[0]);
      }
      if (names.size === 0) throw new Error(`ENOENT: ${dir}`);
      return [...names];
    },
  };
}
