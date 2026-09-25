import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// reactRefresh.configs.vite enforces the React Fast Refresh rule: a module that
// exports a component must export ONLY components. This is what keeps the app
// HMR-safe inside immediately.run — keep it. Data goes in src/data/, hooks in
// src/hooks/.
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Reckoner is a four-realm app (COMPOSITE_CAPABILITY_TOPOLOGY_SPEC §2): the report
    // view and the engine hold NO network — only the connector realm holds egress, and
    // it holds `feed:fetch`, template-bound, never general `net:fetch`. R3-768 removed
    // the report-view egress and this rule makes reintroducing it a lint error rather
    // than a silent regression. Scoped to `src/**` so a future test/build helper may
    // still reach the network where the realm rule does not apply.
    //
    // R3-769 lifts exactly one slot for the connector entry point. To do so, EITHER
    // narrow this block's `files` glob so the connector entry file is not under
    // `src/**/*.{ts,tsx}` (its own module, a sibling dir like `src/connector/`), OR add
    // that one file as a per-file override that re-allows its imports — do NOT delete a
    // `paths` entry below, which lists restricted import *sources* (module names) and
    // would re-open general SDK egress repo-wide. Edit ONE line, do not invent a new
    // pattern.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'The report view and engine hold no network (COMPOSITE_CAPABILITY_TOPOLOGY §2); egress lives only in the connector realm, as template-bound feed:fetch.',
        },
        {
          name: 'XMLHttpRequest',
          message: 'The report view and engine hold no network (COMPOSITE_CAPABILITY_TOPOLOGY §2); egress lives only in the connector realm, as template-bound feed:fetch.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@immediately-run/sdk/netFetch',
              importNames: ['hostFetch', 'netFetch'],
              message: 'The report view and engine hold no network (COMPOSITE_CAPABILITY_TOPOLOGY §2); egress lives only in the connector realm, as template-bound feed:fetch.',
            },
            {
              name: '@immediately-run/sdk',
              importNames: ['hostFetch', 'netFetch'],
              message: 'The report view and engine hold no network (COMPOSITE_CAPABILITY_TOPOLOGY §2); egress lives only in the connector realm, as template-bound feed:fetch.',
            },
          ],
        },
      ],
    },
  },
])
