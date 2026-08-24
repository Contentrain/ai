import { describe, it, expect } from 'vitest'
import type { ProjectIR } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import type { EmitInput } from './index'
import { emitAstroProject, wrapLegacyCss, patternToPagePath, pascalCase } from './index'

// Tiny replicas of the emitted fill helpers — used by the ordering-regression test.
const REPLICA_SLOT = '<!--@@body@@-->'
const replicaFill = (h: string, m: Record<string, string>) =>
  h.replace(/@@([a-z0-9_]+)@@/gi, (_a, k: string) => m[k] ?? '')

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', locales: ['en'] },
  routes: [
    { id: 'r-front', pattern: '/', kind: 'front', family: 'f-front' },
    { id: 'r-single', pattern: '/:slug', kind: 'single', family: 'f-article' },
    {
      id: 'r-term',
      pattern: '/category/:term/page/:page',
      kind: 'term',
      family: 'f-archive',
      params: [
        { name: 'term', source: 'term_slug' },
        { name: 'page', source: 'page_number' },
      ],
      query: 'q-term',
    },
  ],
  families: [
    {
      id: 'f-front',
      kind: 'front',
      chrome: [{ id: 'all', position: 'before_body', html: '<main class="home">Welcome</main>' }],
      css: { strategy: 'localcss', files: ['front.css'] },
    },
    {
      id: 'f-article',
      kind: 'single',
      chrome: [
        { id: 'head', position: 'head', html: '<meta property="og:title" content="@@title@@" />' },
        { id: 'header', position: 'before_body', html: '<header><h1>@@title@@</h1><span>@@date0@@</span></header>' },
        { id: 'footer', position: 'after_body', html: '<footer>by @@author@@</footer>' },
      ],
      slots: [{ kind: 'title' }, { kind: 'date', date_format: 'MMMM D, YYYY' }],
      css: { strategy: 'purge_set', files: ['article.css'] },
    },
    {
      id: 'f-nested',
      kind: 'single',
      chrome: [
        {
          id: 'shell',
          position: 'body',
          html: '<div class="site"><header>H</header><main><article class="post"><h1>@@title@@</h1><div class="entry-content"><!--@@body@@--></div></article></main><footer>F</footer></div>',
        },
      ],
      css: { strategy: 'purge_set', files: [] },
    },
    {
      id: 'f-archive',
      kind: 'term',
      chrome: [{ id: 'header', position: 'before_body', html: '<h1>@@term@@</h1>' }],
      css: { strategy: 'purge_set', files: ['archive.css'] },
      columns: { desktop: 4, mobile: 1 },
    },
  ],
  // gerçek tema deseni: gövde kabı chrome'un DERİNİNDE — before/after'a bölünemez
  // (bkz. f-nested ailesi ve 'nested body chrome' testi)
  components: [
    { id: 'c-comments', type: 'comments', source: 'runtime' },
    { id: 'c-card', type: 'card', source: 'rest', variants: [{ key: 'compact' }, { key: 'featured' }] },
  ],
  queries: [
    {
      id: 'q-term',
      source: 'posts',
      taxonomy: { taxonomy: 'category', term_param: 'term' },
      order: { by: 'date', direction: 'desc' },
      per_page: 12,
      pagination: 'numbered',
    },
  ],
  tokens: { colors: { primary: '#0a2540' }, font_families: { sans: 'Inter, sans-serif' } },
  css_default: 'purge_set',
  viewport_strategy: 'split',
}

const input: EmitInput = {
  ir,
  content: {
    posts: [
      { slug: 'hello', title: 'Hello', body: '<p>Body</p>', dates: ['January 1, 2026'], author: 'Ada Lovelace' },
    ],
    queries: {
      'q-term': [
        {
          params: { term: 'news', page: '1' },
          items: [{ slug: 'hello', title: 'Hello', body: '', excerpt: 'Ex' }],
          item_template: '<article><a href="/@@slug@@/">@@title@@</a><p>@@excerpt@@</p></article>',
        },
      ],
    },
  },
  css: [
    { path: 'front.css', content: 'body{margin:0}' },
    { path: 'article.css', content: '@import url("fonts.css");\n.post{color:red}' },
    { path: 'archive.css', content: '.a{}\n@import url("late.css");' },
  ],
  options: { projectName: 'example-site' },
}

describe('emitAstroProject', () => {
  const result = emitAstroProject(input)

  it('emits a complete, deterministic project', () => {
    const again = emitAstroProject(input)
    expect(again.files).toEqual(result.files)
    for (const path of [
      'package.json',
      'astro.config.mjs',
      'src/styles/modern.css',
      'src/lib/fill.ts',
      'src/layouts/FFront.astro',
      'src/layouts/FArticle.astro',
      'src/layouts/FArchive.astro',
      'src/data/chrome/f-article.json',
      'src/pages/index.astro',
      'src/pages/[slug].astro',
      'src/pages/category/[term]/page/[page].astro',
      'src/data/posts.json',
      'src/data/queries/q-term.json',
      'src/components/CComments.astro',
      'src/components/CCard.astro',
      'public/styles/legacy/article.css',
    ]) {
      expect(result.files[path], path).toBeDefined()
    }
  })

  it('chrome travels as data and is injected as ONE fragment, never compiled', () => {
    const layout = result.files['src/layouts/FArticle.astro']!
    expect(layout).toContain('set:html')
    expect(layout).not.toContain('<header>')
    expect(layout).not.toContain('<slot />')
    expect(layout).toContain('composeBody(')
    expect(layout).toContain(`Astro.slots.render('default')`)
    const chrome = JSON.parse(result.files['src/data/chrome/f-article.json']!)
    // legacy before/after pair composes into a single body with the slot between
    expect(chrome.body).toContain('@@title@@')
    expect(chrome.body).toContain('<!--@@body@@-->')
    expect(chrome.body.indexOf('@@author@@')).toBeGreaterThan(chrome.body.indexOf('<!--@@body@@-->'))
    expect(chrome.head).toContain('og:title')
  })

  it('nested body chrome keeps its structure — the slot lives at depth', () => {
    const chrome = JSON.parse(result.files['src/data/chrome/f-nested.json']!)
    expect(chrome.body).toContain('<div class="entry-content"><!--@@body@@--></div>')
    expect(chrome.body.startsWith('<div class="site">')).toBe(true)
  })

  it('the layout composes via composeBody — never fill-then-split', () => {
    const layout = result.files['src/layouts/FArticle.astro']!
    expect(layout).toContain('composeBody(chrome.body, marks, content)')
    expect(layout).not.toContain('fillMarks(chrome.body')
    const fill = result.files['src/lib/fill.ts']!
    // composeBody must split at the marker before any filling
    expect(fill).toMatch(/composeBody[\s\S]*?\.split\(BODY_SLOT\)[\s\S]*?fillMarks\(part, marks\)/)
  })

  it('regression: filling before splitting eats the marker and drops the body', () => {
    const chromeBody = `<article><h1>@@title@@</h1><div class="entry-content">${REPLICA_SLOT}</div></article>`
    const naive = replicaFill(chromeBody, { title: 'T' }).split(REPLICA_SLOT).join('BODY')
    expect(naive).not.toContain('BODY') // the bug: marker consumed → content silently dropped
    expect(naive).toContain('<!---->')
    const correct = chromeBody.split(REPLICA_SLOT).map((p) => replicaFill(p, { title: 'T' })).join('BODY')
    expect(correct).toContain('<div class="entry-content">BODY</div>')
  })

  it('a body chunk without the marker gets it appended, with a warning', () => {
    const bad = emitAstroProject({
      ir: {
        ...ir,
        families: [{ id: 'f-x', chrome: [{ id: 'b', position: 'body', html: '<main>no marker</main>' }], css: { strategy: 'localcss' } }],
        routes: [],
      },
    })
    const chrome = JSON.parse(bad.files['src/data/chrome/f-x.json']!)
    expect(chrome.body.endsWith('<!--@@body@@-->')).toBe(true)
    expect(bad.warnings.some((w) => w.includes('f-x') && w.includes('marker'))).toBe(true)
  })

  it('legacy css is quarantined in the legacy layer with hoisted imports', () => {
    const css = result.files['public/styles/legacy/article.css']!
    expect(css).toMatch(/^@import url\("fonts.css"\) layer\(legacy\);/)
    expect(css).toContain('@layer legacy {')
    const layout = result.files['src/layouts/FArticle.astro']!
    expect(layout).toContain('href="/styles/legacy/article.css"')
  })

  it('a mid-file @import is left unwrapped and warned about, not silently broken', () => {
    const css = result.files['public/styles/legacy/archive.css']!
    expect(css).not.toContain('@layer')
    expect(result.warnings.some((w) => w.includes('archive.css') && w.includes('@import after'))).toBe(true)
  })

  it('single pages pass the body as a prop for the single-injection splice', () => {
    const page = result.files['src/pages/[slug].astro']!
    expect(page).toContain('getStaticPaths')
    expect(page).toContain('body={post.body}')
    expect(page).not.toContain('set:html={post.body}')
    expect(page).toContain('postMarks(post)')
  })

  it('list pages render through the item template', () => {
    const page = result.files['src/pages/category/[term]/page/[page].astro']!
    expect(page).toContain(`data/queries/q-term.json`)
    expect(page).toContain('fillMarks(page.item_template')
    const data = JSON.parse(result.files['src/data/queries/q-term.json']!)
    expect(data[0].item_template).toContain('@@title@@')
  })

  it('the html lang comes from the site locales, never hardcoded', () => {
    expect(result.files['src/layouts/FArticle.astro']).toContain('<html lang="en">')
    const tr = emitAstroProject({ ...input, ir: { ...ir, site: { ...ir.site, locales: ['tr'] } } })
    expect(tr.files['src/layouts/FArticle.astro']).toContain('<html lang="tr">')
  })

  it('astro.config carries the site URL for canonical/sitemap continuity', () => {
    expect(result.files['astro.config.mjs']).toContain(`site: "https://example.com"`)
  })

  it('a tsconfig extending astro/tsconfigs/base is emitted', () => {
    const ts = JSON.parse(result.files['tsconfig.json']!)
    expect(ts.extends).toBe('astro/tsconfigs/base')
  })

  it('generated frontmatter types its props', () => {
    expect(result.files['src/layouts/FArticle.astro']).toContain('interface Props')
    expect(result.files['src/pages/[slug].astro']).toContain('type Props = { post: (typeof posts)[number] }')
    expect(result.files['src/pages/category/[term]/page/[page].astro']).toContain('type Props = { page: (typeof pages)[number] }')
    expect(result.files['src/components/CComments.astro']).toContain('interface Props')
  })

  it('tailwind evolution layer carries the extracted tokens', () => {
    const modern = result.files['src/styles/modern.css']!
    expect(modern).toContain(`@import 'tailwindcss';`)
    expect(modern).toContain('--color-primary: #0a2540;')
    expect(modern).toContain('--font-sans: Inter, sans-serif;')
  })

  it('split viewport strategy scaffolds both builds', () => {
    const pkg = JSON.parse(result.files['package.json']!)
    expect(pkg.scripts['build:desktop']).toContain('dist/desktop')
    expect(pkg.scripts['build:mobile']).toContain('dist/mobile')
  })

  it('runtime components declare themselves placeholders needing a provider', () => {
    const comments = result.files['src/components/CComments.astro']!
    expect(comments).toContain('source=runtime')
    expect(comments).toContain('cr-component')
    expect(comments).toContain('data-type="comments"')
  })

  it('unknown family and inexpressible patterns warn instead of failing', () => {
    const bad = emitAstroProject({
      ir: {
        ...ir,
        routes: [
          { id: 'r-ghost', pattern: '/x', kind: 'page', family: 'missing' },
          { id: 'r-star', pattern: '/a/*', kind: 'custom', family: 'f-front' },
        ],
      },
    })
    expect(bad.warnings.some((w) => w.includes('r-ghost'))).toBe(true)
    expect(bad.warnings.some((w) => w.includes('r-star'))).toBe(true)
  })

  it('missing css inputs referenced by families are warned about', () => {
    const noCss = emitAstroProject({ ir })
    expect(noCss.warnings.some((w) => w.includes('front.css'))).toBe(true)
  })
})

describe('helpers', () => {
  it('patternToPagePath maps params and rejects the inexpressible', () => {
    expect(patternToPagePath('/')).toBe('index.astro')
    expect(patternToPagePath('/blog')).toBe('blog.astro')
    expect(patternToPagePath('/category/:term/page/:page')).toBe('category/[term]/page/[page].astro')
    expect(patternToPagePath('/a/*')).toBeNull()
  })

  it('pascalCase produces Astro-safe component names', () => {
    expect(pascalCase('f-archive')).toBe('FArchive')
    expect(pascalCase('posts')).toBe('Posts')
  })

  it('wrapLegacyCss respects existing layer() on imports', () => {
    const { content } = wrapLegacyCss('x.css', '@import url("a.css") layer(theme);\n.b{}')
    expect(content).toContain('layer(theme)')
    expect(content).not.toContain('layer(theme) layer(legacy)')
  })
})
