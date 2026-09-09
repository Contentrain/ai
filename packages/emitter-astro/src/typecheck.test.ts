import { describe, it, expect, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject } from './index'

// The generated site's build runs `astro check` first, so emitted TypeScript
// must pass a strict, DOM-aware compiler — the settings astro/tsconfigs/base
// applies. Running tsc over the emitted runtime here means a type error in
// shipped source fails this package's tests, not the first migrated site.

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-tsc')
const run = promisify(execFile)

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com' },
  routes: [],
  families: [],
  components: [
    { id: 'c-comments', type: 'comments', source: 'runtime' },
    { id: 'c-contact', type: 'form', source: 'runtime', model: 'contact' },
  ],
  css_default: 'purge_set',
}

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('emitted TypeScript under astro/tsconfigs/base-equivalent strictness', () => {
  it('fill.ts and embed.ts compile with strict + DOM + verbatimModuleSyntax', async () => {
    const { files } = emitAstroProject({ ir, runtime: { base_url: 'https://studio.test', project_id: 'p' } })
    await mkdir(TMP, { recursive: true })
    await writeFile(join(TMP, 'fill.ts'), files['src/lib/fill.ts']!, 'utf8')
    await writeFile(join(TMP, 'embed.ts'), files['src/lib/embed.ts']!, 'utf8')
    await writeFile(
      join(TMP, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          strict: true,
          noUncheckedIndexedAccess: true,
          verbatimModuleSyntax: true,
          isolatedModules: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['fill.ts', 'embed.ts'],
      }),
      'utf8',
    )
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
    const result = await run(process.execPath, [tsc, '-p', TMP]).catch((e: { stdout?: string; stderr?: string }) => e)
    expect(result.stderr ?? '', result.stdout).toBe('')
    expect(result.stdout ?? '').toBe('')
  }, 60_000)
})
