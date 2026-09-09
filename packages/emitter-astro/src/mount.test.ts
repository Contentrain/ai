import { describe, it, expect } from 'vitest'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION, componentSlot } from '@contentrain/types'
import type { EmitInput } from './index'
import { emitAstroProject, componentMarkers } from './index'

// Emitting a component file is not integration. These tests hold the emitter
// to the whole chain: marker in the chrome → import in the layout → mount at
// the marker → entry address on the page → runtime binding on the element.

const runtime = { base_url: 'https://studio.example.com/', project_id: 'proj_1' }

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', locales: ['en'] },
  routes: [
    { id: 'r-single', pattern: '/:slug', kind: 'single', family: 'f-single' },
    { id: 'r-contact', pattern: '/contact', kind: 'page', family: 'f-contact' },
    { id: 'r-list', pattern: '/news', kind: 'archive', family: 'f-single', query: 'q-news' },
  ],
  families: [
    {
      id: 'f-single',
      kind: 'single',
      chrome: [
        {
          id: 'shell',
          position: 'body',
          html: `<main><article><h1>@@title@@</h1><div class="entry-content">${CHROME_BODY_SLOT}</div></article><section id="comments">${componentSlot('c-comments')}</section></main>`,
        },
      ],
      components: [{ component: 'c-comments', variant: 'threaded' }],
      css: { strategy: 'localcss' },
    },
    {
      id: 'f-contact',
      kind: 'page',
      chrome: [
        { id: 'shell', position: 'body', html: `<main>${CHROME_BODY_SLOT}<div class="wpcf7">${componentSlot('c-contact')}</div></main>` },
      ],
      css: { strategy: 'localcss' },
    },
  ],
  components: [
    { id: 'c-comments', type: 'comments', source: 'runtime', variants: [{ key: 'threaded' }, { key: 'flat' }] },
    { id: 'c-contact', type: 'form', source: 'runtime', model: 'contact', name: 'Contact form' },
  ],
  queries: [{ id: 'q-news', source: 'posts', order: { by: 'date', direction: 'desc' }, per_page: 10, pagination: 'numbered' }],
  css_default: 'purge_set',
}

const input: EmitInput = {
  ir,
  content: {
    posts: [
      { slug: 'hello', title: 'Hello', body: '<p>Hi</p>', entry: { model_id: 'posts', entry_id: 'a1b2c3', locale: 'en' } },
      { slug: 'orphan', title: 'Orphan', body: '<p>No address</p>' },
    ],
    queries: { 'q-news': [{ params: {}, items: [], item_template: '<li>@@title@@</li>' }] },
  },
  runtime,
}

describe('component mounting', () => {
  const bound = emitAstroProject(input)
  const unbound = emitAstroProject({ ...input, runtime: undefined })

  it('componentMarkers reads ids from the chrome in order, once each', () => {
    expect(componentMarkers(`<a>${componentSlot('x')}</a>${componentSlot('y')}${componentSlot('x')}`)).toEqual(['x', 'y'])
    expect(componentMarkers('<p>no markers</p>')).toEqual([])
  })

  it('the layout imports the component and renders it at the marker, with the placement variant', () => {
    const layout = bound.files['src/layouts/FSingle.astro']!
    expect(layout).toContain(`import CComments from '../components/CComments.astro'`)
    expect(layout).toContain('splitComponents')
    expect(layout).toContain(`"c-comments": { Mount: CComments, variant: "threaded" }`)
    expect(layout).toContain('<Mount entry={entry} variant={variant} />')
    expect(layout).toContain('<Fragment set:html={part} />')
    expect(layout).not.toContain('<Fragment set:html={html} />')
    // the marker stays in the chrome data — it is the split point at render time
    const chrome = JSON.parse(bound.files['src/data/chrome/f-single.json']!)
    expect(chrome.body).toContain(componentSlot('c-comments'))
  })

  it('a family without markers keeps the single-fragment body injection', () => {
    const plain = emitAstroProject({
      ...input,
      ir: { ...ir, families: [{ id: 'f-plain', chrome: [{ id: 'b', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` }], css: { strategy: 'localcss' } }], routes: [] },
    })
    const layout = plain.files['src/layouts/FPlain.astro']!
    expect(layout).toContain('<Fragment set:html={html} />')
    expect(layout).not.toContain('splitComponents')
    expect(layout).not.toContain('mounts')
    // astro check hints on an unused destructured prop — only mounting layouts read `entry`
    expect(layout).toMatch(/lang = "en" } = Astro\.props/)
    expect(bound.files['src/layouts/FSingle.astro']).toMatch(/lang = "en", entry } = Astro\.props/)
  })

  it('single pages hand the entry address to the layout; the data file carries it', () => {
    const page = bound.files['src/pages/[slug].astro']!
    expect(page).toContain('entry={post.entry}')
    const data = JSON.parse(bound.files['src/data/posts.json']!)
    expect(data[0].entry).toEqual({ entry_id: 'a1b2c3', locale: 'en', model_id: 'posts' })
    expect(bound.files['src/lib/fill.ts']).toContain('entry?: EntryRef')
  })

  it('a bound comments component mounts a custom element carrying runtime + entry, and its client script', () => {
    const comments = bound.files['src/components/CComments.astro']!
    expect(comments).toContain(`import runtime from '../data/runtime.json'`)
    expect(comments).toContain('<cr-comments')
    expect(comments).toContain('data-base-url={runtime.base_url}')
    expect(comments).toContain('data-project={runtime.project_id}')
    expect(comments).toContain('data-model={entry.model_id}')
    expect(comments).toContain('data-entry={entry.entry_id}')
    expect(comments).toContain(`import { mountComments } from '../lib/embed'`)
    expect(comments).toContain(`customElements.define('cr-comments'`)
    expect(comments).toContain('{entry && (')
    expect(comments).not.toContain('<cr-component')
  })

  it('a bound form component mounts with its model; the runtime binding and embed runtime are emitted once', () => {
    const form = bound.files['src/components/CContact.astro']!
    expect(form).toContain('<cr-form')
    expect(form).toContain('data-model="contact"')
    expect(form).toContain(`import { mountForm } from '../lib/embed'`)
    expect(bound.files['src/layouts/FContact.astro']).toContain(`import CContact from '../components/CContact.astro'`)

    expect(JSON.parse(bound.files['src/data/runtime.json']!)).toEqual({ base_url: 'https://studio.example.com/', project_id: 'proj_1' })
    expect(bound.files['src/lib/embed.ts']).toContain('export async function mountComments')
    expect(bound.files['src/lib/embed.ts']).toContain('export async function mountForm')
  })

  it('no credential is emitted anywhere in the generated site', () => {
    for (const [path, content] of Object.entries(bound.files)) {
      expect(content, path).not.toMatch(/apiKey|Authorization|Bearer /)
    }
  })

  it('without a runtime binding the components stay placeholders, still mounted, each warned once', () => {
    expect(unbound.files['src/components/CComments.astro']).toContain('<cr-component data-type="comments"')
    expect(unbound.files['src/components/CContact.astro']).toContain('<cr-component data-type="form"')
    expect(unbound.files['src/data/runtime.json']).toBeUndefined()
    expect(unbound.files['src/lib/embed.ts']).toBeUndefined()
    // still imported and rendered at the marker — the spot is kept
    expect(unbound.files['src/layouts/FSingle.astro']).toContain(`import CComments from '../components/CComments.astro'`)
    expect(unbound.warnings.filter((w) => w.includes('no runtime binding'))).toHaveLength(2)
  })

  it('a form without a model is a placeholder with a warning even when bound', () => {
    const noModel = emitAstroProject({
      ...input,
      ir: { ...ir, components: [{ id: 'c-contact', type: 'form', source: 'runtime' }] },
    })
    expect(noModel.files['src/components/CContact.astro']).toContain('<cr-component')
    expect(noModel.warnings.some((w) => w.includes('c-contact') && w.includes('no model'))).toBe(true)
  })

  it('a marker without a definition is dropped with a warning; a placement without a marker is warned', () => {
    const ghost = emitAstroProject({
      ...input,
      ir: {
        ...ir,
        families: [
          {
            id: 'f-ghost',
            chrome: [{ id: 'b', position: 'body', html: `<main>${CHROME_BODY_SLOT}${componentSlot('c-nope')}</main>` }],
            components: [{ component: 'c-comments' }],
            css: { strategy: 'localcss' },
          },
        ],
        routes: [],
      },
    })
    const chrome = JSON.parse(ghost.files['src/data/chrome/f-ghost.json']!)
    expect(chrome.body).not.toContain('c-nope')
    expect(ghost.warnings.some((w) => w.includes('c-nope') && w.includes('no component definition'))).toBe(true)
    expect(ghost.warnings.some((w) => w.includes('c-comments') && w.includes('no marker in the body chrome or in any content body'))).toBe(true)
    expect(ghost.files['src/layouts/FGhost.astro']).toContain('<Fragment set:html={html} />')
  })

  it('a marker in a lifted header/footer region is not a mount point and is warned', () => {
    const lifted = emitAstroProject({
      ...input,
      ir: {
        ...ir,
        families: [
          {
            id: 'f-lift',
            chrome: [
              { id: 'h', position: 'header', html: `<header>${componentSlot('c-contact')}</header>` },
              { id: 'b', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` },
            ],
            css: { strategy: 'localcss' },
          },
        ],
        routes: [],
      },
    })
    expect(lifted.warnings.some((w) => w.includes('f-lift') && w.includes('header chrome carries a component marker'))).toBe(true)
  })

  it('posts without an entry address are counted once per collection when comments are mounted', () => {
    expect(bound.warnings.some((w) => w.includes('collection posts: 1 of 2 posts carry no entry address'))).toBe(true)
    expect(unbound.warnings.some((w) => w.includes('carry no entry address'))).toBe(false)
  })

  it('a marker inside a post body (a form in page content) mounts through the page family', () => {
    const inBody = emitAstroProject({
      ...input,
      ir: {
        ...ir,
        routes: [{ id: 'r-page', pattern: '/:slug', kind: 'page', family: 'f-page', collection: 'pages' }],
        families: [{ id: 'f-page', kind: 'page', chrome: [{ id: 'b', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` }], css: { strategy: 'localcss' } }],
      },
      content: {
        collections: {
          pages: [
            { slug: 'contact', title: 'Contact', body: `<h2>Write to us</h2>${componentSlot('c-contact')}` },
            { slug: 'about', title: 'About', body: `<p>Plain</p>${componentSlot('c-ghost')}` },
          ],
        },
      },
    })
    const layout = inBody.files['src/layouts/FPage.astro']!
    expect(layout).toContain(`import CContact from '../components/CContact.astro'`)
    expect(layout).toContain(`"c-contact": { Mount: CContact, variant: "default" }`)
    expect(layout).toContain('splitComponents')
    // the marker stays in the data — the split happens on the composed html at render time
    const pages = JSON.parse(inBody.files['src/data/pages.json']!)
    expect(pages[0].body).toContain(componentSlot('c-contact'))
    expect(inBody.warnings.some((w) => w.includes('f-page') && w.includes('c-ghost') && w.includes('no component definition'))).toBe(true)
    expect(inBody.warnings.some((w) => w.includes('c-contact') && w.includes('no component definition'))).toBe(false)
  })

  it('is deterministic', () => {
    expect(emitAstroProject(input).files).toEqual(bound.files)
  })
})
