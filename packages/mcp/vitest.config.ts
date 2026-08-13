import { defineConfig } from 'vitest/config'

/**
 * This package had no vitest config at all, so it ran on defaults that happen
 * to be the worst case for it. Three of the settings below are load-bearing;
 * the rest are budgets with reasons.
 */
export default defineConfig({
  test: {
    // The default `include` glob matches any *.test.ts under the package, which
    // swept up a scanner fixture — `tests/fixtures/scanner-golden/test-noise/
    // src/utils/messages.test.ts` is sample source code for the AST scanner to
    // chew on, not a test, and it was being forked and run as one.
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/fixtures/**', 'node_modules/**', 'dist/**'],

    // Trimmed PATH for every worker.
    //
    // `createGit` resolves the binary once, so production code no longer pays
    // PATH resolution — but tests still spawn git directly (fixture setup,
    // assertions on repo state), and anything shelling out by bare name pays
    // ~9x inside a worker: measured 198.8ms by name vs 22.0ms by absolute path
    // on a 41-entry PATH. Belt and braces, and it costs nothing.
    setupFiles: ['./tests/setup/trim-path.ts'],

    // Default 5s is not enough for anything that touches git — a single
    // `contentrain_init` is 33 subprocesses. Files that need more still set
    // their own; this is the floor that stops a slow machine from reporting
    // a timeout as a test failure.
    testTimeout: 30_000,
    // Fixture setup (template build, clone) lives in hooks and is the slowest
    // single step in the suite.
    hookTimeout: 30_000,
  },
})
