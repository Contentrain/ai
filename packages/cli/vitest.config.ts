import { defineConfig } from 'vitest/config'

/** Mirrors packages/mcp/vitest.config.ts — see the rationale there. */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/fixtures/**', 'node_modules/**', 'dist/**', 'src/serve-ui/**'],
    setupFiles: ['../mcp/tests/setup/trim-path.ts'],
    // The three integration files drive real `contentrain init` / `validate --fix`
    // runs. They measured 26-32s against the old 30s default, which is why they
    // flaked rather than failed. The headroom is deliberate.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
