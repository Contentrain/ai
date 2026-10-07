import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A large site under a small file-descriptor limit. Astro starts every
// collection's loader at once; each used to read every model and content file
// in parallel, and a read that ran out of descriptors (EMFILE) came back as
// "missing" — a collection built short, or the build died elsewhere. The child
// runs the built loader (dist/) the way Astro does — all loaders together, one
// config object — under `ulimit -n 256`, and reports every collection's count.

const DIST = pathToFileURL(join(import.meta.dirname, '../../dist/astro/index.mjs')).href

const RUN = `
const { contentrainLoader } = await import(process.argv[2])
const [root, ...models] = process.argv.slice(3)
const config = { root }
const counts = await Promise.all(models.map(async (model) => {
  const ids = []
  const warnings = []
  await contentrainLoader({ model, root }).load({
    config,
    store: { clear() { ids.length = 0 }, set(entry) { ids.push(entry.id) } },
    logger: { info() {}, warn(message) { warnings.push(message) } },
  })
  return [model, ids.length, warnings.length]
}))
console.log(JSON.stringify(counts))
`

/** `pages` page singletons, each with `refs` image fields, plus one collection of `items` entries. */
function store(root: string, pages: number, refs: number, items: number): string[] {
  const dir = (...parts: string[]) => { const path = join(root, '.contentrain', ...parts); mkdirSync(path, { recursive: true }); return path }
  writeFileSync(join(dir(), 'config.json'), JSON.stringify({ version: 1, stack: 'astro', workflow: 'review', domains: ['pages', 'blog'], locales: { default: 'en', supported: ['en'] } }))
  const models: string[] = []
  for (let i = 0; i < pages; i++) {
    const id = `page-${i}`
    const fields: Record<string, unknown> = { title: { type: 'string', required: true } }
    const data: Record<string, unknown> = { title: `Page ${i}` }
    for (let r = 0; r < refs; r++) {
      fields[`image_${r}`] = { type: 'image' }
      data[`image_${r}`] = `media/page-${i}-${r}.jpg`
    }
    writeFileSync(join(dir('models'), `${id}.json`), JSON.stringify({ id, name: id, kind: 'singleton', domain: 'pages', i18n: false, title_field: 'title', fields }))
    writeFileSync(join(dir('content', 'pages', id), 'data.json'), JSON.stringify(data))
    models.push(id)
  }
  writeFileSync(join(dir('models'), 'posts.json'), JSON.stringify({ id: 'posts', name: 'Posts', kind: 'collection', domain: 'blog', i18n: true, title_field: 'title', fields: { title: { type: 'string', required: true } } }))
  writeFileSync(join(dir('content', 'blog', 'posts'), 'en.json'), JSON.stringify(Object.fromEntries(Array.from({ length: items }, (_, i) => [`p${String(i).padStart(4, '0')}`, { title: `Post ${i}` }]))))
  return [...models, 'posts']
}

function underLimit(root: string, models: string[]): Array<[string, number, number]> {
  const script = join(root, 'run.mjs')
  writeFileSync(script, RUN)
  writeFileSync(join(root, 'models.txt'), models.join('\n'))
  // The model list goes through a file: a thousand ids overflow nothing, but keep the command short.
  const out = execFileSync('/bin/sh', ['-c', `ulimit -n 256 && exec "${process.execPath}" "${script}" "${DIST}" "${root}" $(cat "${join(root, 'models.txt')}")`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return JSON.parse(out) as Array<[string, number, number]>
}

describe('contentrainLoader under a small file-descriptor limit', () => {
  let root: string
  beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'cr-fd-')) })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('loads every entry of 300 collections and 3000 image refs at ulimit -n 256', () => {
    const models = store(join(root, 'three-hundred'), 300, 10, 500)
    const counts = underLimit(join(root, 'three-hundred'), models)
    expect(counts).toHaveLength(301)
    expect(counts.filter(([model, n]) => n !== (model === 'posts' ? 500 : 1))).toEqual([])
    expect(counts.filter(([, , warnings]) => warnings > 0)).toEqual([])
  }, 120_000)

  it('loads every entry of 1000 collections at ulimit -n 256', () => {
    const models = store(join(root, 'thousand'), 1000, 3, 100)
    const counts = underLimit(join(root, 'thousand'), models)
    expect(counts).toHaveLength(1001)
    expect(counts.filter(([model, n]) => n !== (model === 'posts' ? 100 : 1))).toEqual([])
  }, 120_000)
})
