import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: '.',
    typecheck: {
      // `tsconfig.json` only includes `src`, so tests are otherwise never
      // type-checked. Type-level contracts (e.g. "reading .body off an index
      // entry must not compile") live in *.test-d.ts and are asserted here.
      enabled: true,
      include: ['tests/**/*.test-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
