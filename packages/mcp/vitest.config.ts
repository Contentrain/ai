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
    // `contentrain_init` is 33 subprocesses.
    //
    // 60s rather than 30s because 30s was not enough, and the way it failed is
    // the argument: a test that runs in 2.1s alone took over 30s with all six
    // packages competing for the machine, and reported as a test failure
    // rather than as contention. Files doing heavy git work still declare
    // their own 120s; this is the floor for the ones that do not, so a file
    // that forgets is not silently at risk. A genuine hang costs 60s instead
    // of 30s once, which is a cheaper mistake than a false red.
    testTimeout: 60_000,
    // Fixture setup (template build, clone) lives in hooks and is the slowest
    // single step in the suite.
    hookTimeout: 60_000,
  },
})
