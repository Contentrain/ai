// The deterministic generator in the worker's mode: the project directory
// already holds the imported store and what earlier stages wrote (media, a
// favicon); the starter is written around them and they stay byte-identical.

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KIT_COMPONENTS_DIR, loadCatalog, type KitCatalog } from '@contentrain/astro-kit'
import { PROJECT_PLAN_FORMAT, type ProjectPlan } from '@contentrain/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateProject, type GenerateReport } from '../src/generate/index'
import { starterDir } from '../src/write'

const REPO = join(import.meta.dirname, '..', '..', '..')
const FIXTURE = join(REPO, 'templates', 'fixtures', 'wp-demo', '.contentrain')

const plan: ProjectPlan = {
  format: PROJECT_PLAN_FORMAT,
  source: { origin: 'https://northwind.example', builder: 'gutenberg', facts: 'test' },
  site: {
    url: 'https://northwind.example', title: 'Northwind', locale: 'en',
    permalinks: { post: '/:year/:slug/', page: '/:path/', category: '/topics/:slug/', tag: '/tag/:slug/', author: '/author/:slug/', blog: '/journal/' },
    home: { kind: 'page', slug: 'about' }, postsPerPage: 6, menus: { primary: 'primary', footer: 'footer' },
    redirects: { '/old/': '/about/', '/gone/': { status: 410, destination: '/' } },
    tokens: { roles: { 'color-accent': '#503AA8' }, extra: { 'color-brand': '#FFEE58' }, presets: { color: { 'accent-1': '#FFEE58' } } },
  },
  layout: {},
  models: [{
    id: 'section-card-grid', kind: 'collection', origin: 'plan', name: 'Card sections', domain: 'sections', i18n: true, title_field: 'title',
    fields: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', fields: { title: { type: 'string', required: true }, text: { type: 'text' } } } } },
  }],
  components: [{ id: 'CardGrid', origin: 'kit', kit: { id: 'card-grid' } }],
  routes: [
    { id: 'post', kind: 'post', pattern: '/:year/:slug/', template: 't1', source: { model: 'posts' }, body: 'rich-text', sections: [] },
    { id: 'page-services', kind: 'page', pattern: '/:path/', template: 't2', source: { model: 'pages', where: { wp_id: [303] } }, body: 'composed', sections: [
      { component: 'CardGrid', bind: { kind: 'model', model: 'section-card-grid', entry: 'services-0', props: { title: 'field:title', items: 'field:items' } } },
    ] },
  ],
}

let project: string
let catalog: KitCatalog
let report: GenerateReport
const before = new Map<string, string>()
const PRESERVED = ['public/media/2026/01/cover.png', 'public/favicon.svg', '.contentrain/content/site/pages/data.json', '.contentrain/meta/pages/en.json']

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), 'writer-generate-'))
  catalog = await loadCatalog()
  // The worker's project directory: the imported store, media and the site's own favicon.
  await cp(FIXTURE, join(project, '.contentrain'), { recursive: true })
  await cp(join(starterDir(), '.contentrain', 'models'), join(project, '.contentrain', 'models'), { recursive: true, force: false, errorOnExist: false })
  await mkdir(join(project, 'public', 'media', '2026', '01'), { recursive: true })
  await writeFile(join(project, 'public', 'media', '2026', '01', 'cover.png'), 'png bytes')
  await writeFile(join(project, 'public', 'favicon.svg'), '<svg>the site\'s own</svg>')
  for (const path of PRESERVED) before.set(path, await readFile(join(project, path), 'utf8'))
  report = await generateProject({ plan, catalog, kitRoot: KIT_COMPONENTS_DIR, starterDir: starterDir(), outDir: project })
}, 60_000)

afterAll(async () => {
  await rm(project, { recursive: true, force: true })
})

const read = (path: string) => readFile(join(project, path), 'utf8')

describe('generateProject in place', () => {
  it('leaves imported content, meta, media and existing public files byte-identical', async () => {
    for (const path of PRESERVED) expect(await read(path), path).toBe(before.get(path))
    expect(report.written.filter(path => path.startsWith('.contentrain/content/') || path.startsWith('public/'))).toEqual([])
  })

  it('writes the site settings from the plan', async () => {
    const config = await read('src/site.config.ts')
    expect(config).toContain(`post: '/:year/:slug/'`)
    expect(config).toContain(`home: { kind: 'page', slug: 'about' }`)
    expect(config).toContain('postsPerPage: 6')
    expect(await read('astro.config.mjs')).toContain(`const site = 'https://northwind.example'`)
    expect(JSON.parse(await read('redirects.json'))).toEqual({ '/gone/': { status: 410, destination: '/' }, '/old/': '/about/' })
  })

  it('sets the design roles and adds the source scale and presets', async () => {
    const css = await read('src/styles/global.css')
    expect(css).toContain('--color-accent: #503AA8;')
    expect(css).toContain('--color-brand: #FFEE58;')
    expect(css).toContain("@import './wp-presets.css';")
    expect(await read('src/styles/wp-presets.css')).toContain('.has-accent-1-color { color: var(--wp--preset--color--accent-1); }')
  })

  it('writes plan models and the content config over every model', async () => {
    expect(JSON.parse(await read('.contentrain/models/section-card-grid.json'))).toMatchObject({ id: 'section-card-grid', domain: 'sections', title_field: 'title' })
    expect(JSON.parse(await read('.contentrain/config.json')).domains).toContain('sections')
    expect(await read('src/content.config.ts')).toContain(`sectionCardGrid: defineCollection({`)
  })

  it('generates the composed view and registers it by WordPress id', async () => {
    expect(report.routes.views).toEqual([{ route: 'page-services', file: 'src/views/composed/PageServices.astro', wpIds: [303] }])
    expect(report.routes.covered).toEqual(['post'])
    expect(await read('src/views/composed/index.ts')).toContain('303: PageServices,')
    expect(await read('src/views/composed/PageServices.astro')).toContain(`await getEntry('sectionCardGrid', 'en/services-0')`)
  })

  it('copies the kit components the plan places', async () => {
    expect(report.kit.components).toContain('card-grid')
    expect(await read('src/components/kit/card-grid/CardGrid.astro')).toBe(await readFile(join(KIT_COMPONENTS_DIR, 'card-grid', 'CardGrid.astro'), 'utf8'))
  })

  it('refuses a CSS value that could break out of its declaration', async () => {
    const bad = { ...plan, site: { ...plan.site, tokens: { roles: { 'color-accent': 'red; } body { display: none' } } } } as ProjectPlan
    const out = await mkdtemp(join(tmpdir(), 'writer-generate-bad-'))
    await cp(join(project, '.contentrain'), join(out, '.contentrain'), { recursive: true })
    await expect(generateProject({ plan: bad, catalog, kitRoot: KIT_COMPONENTS_DIR, starterDir: starterDir(), outDir: out })).rejects.toThrow(/not a plain CSS value/)
    await rm(out, { recursive: true, force: true })
  })
})
