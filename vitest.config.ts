// Vitest reads this file; `vite build` reads vite.config.ts. Kept separate because the
// repo's vite is the rolldown line while vitest bundles the rollup line, and their
// plugin types refuse to unify in one `defineConfig` call — the cast below is the one
// place the two lineages meet, and it is runtime-safe (vitest consumes the same plugin
// objects vite does).
import { defineConfig } from 'vitest/config'
import type { UserConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig({
  ...(viteConfig as UserConfig),
  test: {
    server: {
      deps: {
        // The SDK ships extensionless ESM relative imports (bundler-resolvable, not
        // Node-resolvable), so vitest must transform it rather than let Node load it.
        inline: ['@immediately-run/sdk'],
      },
    },
  },
})
