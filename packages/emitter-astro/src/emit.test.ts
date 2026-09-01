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
    {
      id: 'r-single',
      pattern: '/:year/:month/:day/:slug',
      kind: 'single',
      family: 'f-article',
      params: [
        { name: 'year', source: 'post_year' },
        { name: 'month', source: 'post_month' },
        { name: 'day', source: 'post_day' },
        { name: 'slug', source: 'post_slug' },
      ],
    },
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
    {
      id: 'r-nested-term',
      pattern: '/category/:term*',
      kind: 'term',
      family: 'f-archive',
      params: [{ name: 'term', source: 'term_slug' }],
      query: 'q-nested',
    },
    {
      id: 'r-page',
      pattern: '/:slug*',
      kind: 'page',
      family: 'f-nested',
      collection: 'pages',
    },
    {
      id: 'r-single-en',
      pattern: '/en/:slug',
      kind: 'single',
      family: 'f-article',
      collection: 'posts_en',
      locale: 'en-GB',
      title: 'English posts',
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
      root_attrs: {
        html: { class: 'js wf-proximanova' },
        body: { class: 'wp-singular single postid-@@wp_id@@', 'data-theme': 'light' },
      },
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
      {
        slug: 'hello',
        title: 'Hello',
        body: '<p>Body</p>',
        dates: ['January 1, 2026'],
        author: 'Ada Lovelace',
        params: { year: '2026', month: '01', day: '01' },
        css: ['post-11368.css'],
      },
    ],
    collections: {
      pages: [{ slug: 'hizmetler/danismanlik', title: 'Danışmanlık', body: '<p>Sayfa</p>' }],
      posts_en: [{ slug: 'hello-en', title: 'Hello', body: '<p>EN</p>' }],
    },
    queries: {
      'q-nested': [
        {
          params: { term: 'about-cc/events' },
          items: [{ slug: 'e1', title: 'Etkinlik', body: '' }],
          item_template: '<article>@@title@@</article>',
        },
      ],
      'q-term': [
        {
          params: { term: 'news', page: '1' },
          title: 'Category: News – Example',
          marks: { term_name: 'News' },
          sections: [
            { template: '<article class="hero">@@title@@</article>', wrapper: '<div class="hero-wrap"><!--@@items@@--></div>', count: 1 },
            { template: '<article class="card">@@title@@</article>', wrapper: '<div class="grid"><!--@@items@@--></div>' },
          ],
          css: ['archive-2.css'],
          items: [{ slug: 'hello', title: 'Hello', body: '', excerpt: 'Ex' }],
          item_template: '<article><a href="/@@slug@@/">@@title@@</a><p>@@excerpt@@</p></article>',
        },
      ],
    },
  },
  css: [
    { path: 'post-11368.css', content: '.post-11368{color:blue}' },
    { path: 'archive-2.css', content: '.archive-2{color:green}' },
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
      'src/pages/[year]/[month]/[day]/[slug].astro',
      'src/pages/category/[term]/page/[page].astro',
      'src/pages/category/[...term].astro',
      'src/pages/[...slug].astro',
      'src/data/pages.json',
      'src/data/posts_en.json',
      'src/pages/en/[slug].astro',
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
    expect(fill).toMatch(/composeBody[\s\S]*?\.split\(BODY_SLOT\)[\s\S]*?renderTemplate\(part, values\)/)
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
    const page = result.files['src/pages/[year]/[month]/[day]/[slug].astro']!
    expect(page).toContain('getStaticPaths')
    expect(page).toContain('body={post.body}')
    expect(page).not.toContain('set:html={post.body}')
    expect(page).toContain('postMarks(post)')
  })

  it('list pages render through the item template', () => {
    const page = result.files['src/pages/category/[term]/page/[page].astro']!
    expect(page).toContain(`data/queries/q-term.json`)
    expect(page).toContain('page.item_template ? [{ template: page.item_template }]')
    const data = JSON.parse(result.files['src/data/queries/q-term.json']!)
    expect(data[0].item_template).toContain('@@title@@')
  })

  it('root attributes travel to the emitted page — themes key layout off them', () => {
    const chrome = JSON.parse(result.files['src/data/chrome/f-nested.json']!)
    expect(chrome.html_attrs).toEqual({ class: 'js wf-proximanova' })
    expect(chrome.body_attrs.class).toBe('wp-singular single postid-@@wp_id@@')
    const layout = result.files['src/layouts/FNested.astro']!
    expect(layout).toContain('<html {...htmlAttrs}>')
    expect(layout).toContain('<body {...bodyAttrs}>')
    // marks fill attribute values too (per-page classes like postid-123)
    expect(layout).toContain('fillAttrs(chrome.body_attrs, marks)')
    expect(result.files['src/lib/fill.ts']).toContain('export function fillAttrs')
  })

  it('a family without root attributes emits empty maps, not undefined', () => {
    const chrome = JSON.parse(result.files['src/data/chrome/f-article.json']!)
    expect(chrome.html_attrs).toEqual({})
    expect(chrome.body_attrs).toEqual({})
  })

  it('the html lang comes from the site locales, never hardcoded', () => {
    expect(result.files['src/layouts/FArticle.astro']).toContain('lang = "en"')
    const tr = emitAstroProject({ ...input, ir: { ...ir, site: { ...ir.site, locales: ['tr'] } } })
    expect(tr.files['src/layouts/FArticle.astro']).toContain('lang = "tr"')
    // an explicit source lang overrides the page's (spread order)
    expect(tr.files['src/layouts/FArticle.astro']).toMatch(/lang, \.\.\.fillAttrs\(chrome\.html_attrs/)
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
    expect(result.files['src/pages/[year]/[month]/[day]/[slug].astro']).toContain('type Props = { post: (typeof posts)[number] }')
    expect(result.files['src/pages/category/[term]/page/[page].astro']).toContain('type Props = { page: (typeof pages)[number] }')
    expect(result.files['src/components/CComments.astro']).toContain('interface Props')
  })

  it('dated permalinks get their parameters from each post, not the template', () => {
    const page = result.files['src/pages/[year]/[month]/[day]/[slug].astro']!
    expect(page).toContain('params: { ...(post.params ?? {}), slug: post.slug }')
    const posts = JSON.parse(result.files['src/data/posts.json']!)
    expect(posts[0].params).toEqual({ year: '2026', month: '01', day: '01' })
  })

  it('per-page stylesheets reach the page, family stylesheets stay on the family', () => {
    expect(result.files['src/pages/[year]/[month]/[day]/[slug].astro']).toContain('css={post.css ?? []}')
    expect(result.files['src/pages/category/[term]/page/[page].astro']).toContain('css={page.css ?? []}')
    expect(result.files['src/layouts/FArticle.astro']).toContain('cssHref(file)')
    expect(result.files['public/styles/legacy/post-11368.css']).toContain('@layer legacy')
    expect(result.files['public/styles/legacy/archive-2.css']).toContain('@layer legacy')
  })

  it('missing per-page stylesheets are warned about by owner', () => {
    const missing = emitAstroProject({
      ir,
      content: { posts: [{ slug: 's', title: 'T', body: '', css: ['ghost.css'] }] },
    })
    expect(missing.warnings.some((w) => w.includes('post s') && w.includes('ghost.css'))).toBe(true)
  })

  it('list pages get display marks, not just route parameter slugs', () => {
    const page = result.files['src/pages/category/[term]/page/[page].astro']!
    expect(page).toContain('const marks = { ...page.params, ...(page.marks ?? {}) }')
    expect(page).toContain('renderSections(sections, page.items, postMarks)')
    const data = JSON.parse(result.files['src/data/queries/q-term.json']!)
    expect(data[0].marks).toEqual({ term_name: 'News' })
  })

  it('the build script type-checks before building', () => {
    const pkg = JSON.parse(result.files['package.json']!)
    expect(pkg.scripts.build).toBe('astro check && astro build')
    expect(pkg.devDependencies['@astrojs/check']).toBeDefined()
    expect(pkg.devDependencies.typescript).toBeDefined()
  })

  it('nested taxonomy addresses survive as rest parameters', () => {
    // `/category/:term*` → `[...term].astro`; without it `/category/about-cc/events/`
    // collapses to `/category/events/` and every nested link breaks.
    const page = result.files['src/pages/category/[...term].astro']!
    expect(page).toContain(`data/queries/q-nested.json`)
    const data = JSON.parse(result.files['src/data/queries/q-nested.json']!)
    expect(data[0].params.term).toBe('about-cc/events')
    expect(patternToPagePath('/category/:term*')).toBe('category/[...term].astro')
    expect(patternToPagePath('/:slug*')).toBe('[...slug].astro')
  })

  it('a rest parameter before other segments is warned about', () => {
    const paged = emitAstroProject({
      ir: {
        ...ir,
        routes: [{ id: 'r-x', pattern: '/category/:term*/page/:page', kind: 'term', family: 'f-archive', query: 'q-term' }],
      },
      content: input.content,
    })
    expect(paged.files['src/pages/category/[...term]/page/[page].astro']).toBeDefined()
    expect(paged.warnings.some((w) => w.includes('r-x') && w.includes('rest parameter'))).toBe(true)
  })

  it('each single route reads its own collection, never a shared posts.json', () => {
    const pagesData = JSON.parse(result.files['src/data/pages.json']!)
    expect(pagesData[0].slug).toBe('hizmetler/danismanlik')
    const postsData = JSON.parse(result.files['src/data/posts.json']!)
    expect(postsData[0].slug).toBe('hello')
    expect(result.files['src/pages/[...slug].astro']).toContain(`data/pages.json`)
    expect(result.files['src/pages/[year]/[month]/[day]/[slug].astro']).toContain(`data/posts.json`)
    // no duplicate-file warning: the two single routes no longer collide
    expect(result.warnings.some((w) => w.includes('duplicate file'))).toBe(false)
  })

  it('an empty collection warns by name', () => {
    const empty = emitAstroProject({
      ir: { ...ir, routes: [{ id: 'r-cpt', pattern: '/recipes/:slug', kind: 'single', family: 'f-article', collection: 'recipes' }] },
    })
    expect(empty.warnings.some((w) => w.includes('r-cpt') && w.includes('"recipes"'))).toBe(true)
  })

  it('list pages carry their own document title', () => {
    const page = result.files['src/pages/category/[term]/page/[page].astro']!
    expect(page).toContain('const title = page.title ??')
    expect(page).toContain('title={title || String(marks.term_name ?? page.params.term ?? \'\')}')
    const data = JSON.parse(result.files['src/data/queries/q-term.json']!)
    expect(data[0].title).toBe('Category: News – Example')
  })

  it('a route title covers pages that have none of their own', () => {
    const withTitle = emitAstroProject({
      ir: { ...ir, routes: [{ id: 'r-about', pattern: '/about', kind: 'page', family: 'f-front', title: 'About us' }] },
    })
    expect(withTitle.files['src/pages/about.astro']).toContain('title="About us"')
  })

  it('lists render in sections — a big card then a grid', () => {
    const page = result.files['src/pages/category/[term]/page/[page].astro']!
    expect(page).toContain('renderSections(sections, page.items, postMarks)')
    expect(page).toContain('page.sections ?? (page.item_template ? [{ template: page.item_template }] : [])')
    const data = JSON.parse(result.files['src/data/queries/q-term.json']!)
    expect(data[0].sections).toHaveLength(2)
    expect(data[0].sections[0].count).toBe(1)
  })

  it('sections satisfy the item-template requirement — no false fallback warning', () => {
    const sectioned = emitAstroProject({
      ir: { ...ir, routes: [{ id: 'r-l', pattern: '/l', kind: 'archive', family: 'f-front', query: 'q' }] },
      content: { queries: { q: [{ params: {}, items: [], sections: [{ template: '<b>@@title@@</b>' }] }] } },
    })
    expect(sectioned.warnings.some((w) => w.includes('item template missing'))).toBe(false)
  })

  it('each route carries its own language on a multilingual site', () => {
    const en = result.files['src/pages/en/[slug].astro']!
    expect(en).toContain('lang={post.locale ?? "en-GB"}')
    expect(en).toContain(`data/posts_en.json`)
    const tr = result.files['src/pages/[year]/[month]/[day]/[slug].astro']!
    expect(tr).toContain('lang={post.locale ?? "en"}') // project default
    const layout = result.files['src/layouts/FArticle.astro']!
    expect(layout).toContain('lang = "en"') // default when a page passes none
    expect(layout).toContain('const htmlAttrs = { lang,')
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
    expect(patternToPagePath('/category/:term*')).toBe('category/[...term].astro')
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
