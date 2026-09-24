import { describe, it, expect, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
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
  it('fill.ts, embed.ts and the image pass compile with strict + DOM + verbatimModuleSyntax', async () => {
    const { files } = emitAstroProject({ ir, runtime: { base_url: 'https://studio.test', project_id: 'p' } })
    await mkdir(TMP, { recursive: true })
    await writeFile(join(TMP, 'fill.ts'), files['src/lib/fill.ts']!, 'utf8')
    await writeFile(join(TMP, 'embed.ts'), files['src/lib/embed.ts']!, 'utf8')
    await writeFile(join(TMP, 'images.ts'), files['src/lib/images.ts']!, 'utf8')
    await writeFile(join(TMP, 'optimize-images.ts'), files['src/lib/optimize-images.ts']!, 'utf8')
    // The one Astro API optimize-images.ts uses, declared as Astro types it.
    await writeFile(join(TMP, 'astro-assets.d.ts'), `declare module 'astro:assets' {
  export function getImage(options: { src: string; format?: string; width?: number; height?: number; inferSize?: boolean; widths?: number[] }): Promise<{ src: string; srcSet: { attribute: string }; attributes: Record<string, unknown> }>
}
`, 'utf8')
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
        files: ['fill.ts', 'embed.ts', 'images.ts', 'optimize-images.ts', 'astro-assets.d.ts'],
      }),
      'utf8',
    )
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
    const result = await run(process.execPath, [tsc, '-p', TMP]).catch((e: { stdout?: string; stderr?: string }) => e)
    expect(result.stderr ?? '', result.stdout).toBe('')
    expect(result.stdout ?? '').toBe('')
  }, 60_000)
})

describe('the seo object each emitted page hands its layout is a SeoInput', () => {
  // astro check types `seo={{ … }}` against the layout's `seo?: SeoInput`: a
  // key the page passes and SeoInput lacks fails the whole build (0.16.0: the
  // archive pages' `feed`). The literal is lifted out of every emitted page and
  // compiled against the emitted runtime, with the page's frontmatter names.
  const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-tsc-seo')

  afterAll(async () => {
    await rm(DIR, { recursive: true, force: true })
  })

  it('archive (with its feed), list, static and author pages all compile', async () => {
    const seoIr: ProjectIR = {
      version: MIGRATION_CONTRACT_VERSION,
      site: { url: 'https://example.com', title: 'Example', locales: ['en'] },
      routes: [
        { id: 'r-post', pattern: '/:year/:slug', kind: 'single', family: 'f' },
        { id: 'r-cat', pattern: '/categoria/:term*', kind: 'archive', family: 'f', query: 'q-cat' },
        { id: 'r-tag', pattern: '/tag/:tag', kind: 'archive', family: 'f', query: 'q-tag' },
        { id: 'r-news', pattern: '/news', kind: 'archive', family: 'f', query: 'q-news' },
        { id: 'r-about', pattern: '/about', kind: 'page', family: 'f' },
      ],
      families: [{ id: 'f', kind: 'single', chrome: [{ id: 'body', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` }], css: { strategy: 'localcss' } }],
      queries: ['q-cat', 'q-tag', 'q-news'].map((id) => ({ id, source: 'posts', order: { by: 'date' as const, direction: 'desc' as const }, per_page: 10, pagination: 'numbered' as const })),
      css_default: 'purge_set',
    }
    const { files } = emitAstroProject({
      ir: seoIr,
      content: {
        posts: [{ slug: 'hello', title: 'Hello', body: '', params: { year: '2025' } }],
        queries: {
          'q-cat': [{ params: { term: 'news' }, items: [] }],
          'q-tag': [{ params: { tag: 'x' }, items: [], profile: { name: 'Ada' } }],
          'q-news': [{ params: {}, items: [] }],
        },
      },
    })
    const literals = Object.entries(files)
      .filter(([path]) => path.startsWith('src/pages/') && path.endsWith('.astro'))
      .flatMap(([path, source]) => [...source.matchAll(/seo=\{(\{[\s\S]*?\})\}\s*(?:\/>|\n)/g)].map((m) => ({ path, literal: m[1]! })))
    // Every page kind that builds its seo object inline is covered.
    expect(literals.some((l) => l.literal.includes('feed:'))).toBe(true)
    expect(literals.length).toBeGreaterThanOrEqual(4)

    await mkdir(DIR, { recursive: true })
    await writeFile(join(DIR, 'fill.ts'), files['src/lib/fill.ts']!, 'utf8')
    await writeFile(join(DIR, 'check.ts'), [
      `import { entryAddress, type EmittedQueryPage, type SeoInput } from './fill'`,
      `declare const page: EmittedQueryPage`,
      `declare const title: string`,
      `void entryAddress`,
      ...literals.map((l, i) => `// ${l.path}\nexport const seo${i}: SeoInput = ${l.literal}`),
    ].join('\n'), 'utf8')
    await writeFile(join(DIR, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'], strict: true, noUncheckedIndexedAccess: true, verbatimModuleSyntax: true, noEmit: true, skipLibCheck: true, types: [] },
      files: ['fill.ts', 'check.ts'],
    }), 'utf8')
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
    const result = await run(process.execPath, [tsc, '-p', DIR]).catch((e: { stdout?: string; stderr?: string }) => e)
    expect(result.stdout ?? '').toBe('')
  }, 60_000)
})
