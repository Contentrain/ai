import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject } from './index'

// The template runtime is emitted as source text, so a test that re-implements
// it proves nothing about what ships. This suite writes the emitted fill.ts to
// disk and imports it: the real functions, the real regexes. (A backslash eaten
// by the template literal silently broke the repeat/if patterns once — that
// class of bug cannot survive this test.)

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp')

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com' },
  routes: [],
  families: [],
  css_default: 'purge_set',
}

type Values = Record<string, unknown>
interface Runtime {
  renderTemplate: (html: string, values: Values) => string
  fillMarks: (html: string, values: Values) => string
  expandRepeats: (html: string, values: Values) => string
  applyConditions: (html: string, values: Values) => string
  composeBody: (chromeBody: string, values: Values, content: string) => string
  renderSections: (
    sections: Array<{ template: string; wrapper?: string; count?: number }>,
    items: Array<Record<string, unknown>>,
    values: (item: Record<string, unknown>) => Values,
  ) => string
  postMarks: (post: Record<string, unknown>) => Values
  cssHref: (file: string) => string
  esc: (value: unknown) => string
}
let rt: Runtime

beforeAll(async () => {
  const { files } = emitAstroProject({ ir })
  await mkdir(TMP, { recursive: true })
  await writeFile(join(TMP, 'fill.ts'), files['src/lib/fill.ts']!, 'utf8')
  rt = (await import(/* @vite-ignore */ join(TMP, 'fill.ts'))) as unknown as Runtime
})

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('emitted template runtime', () => {
  it('escapes by default and inserts _html marks raw', () => {
    const values = { title: 'A & B <script>', body_html: '<p>Body <a href="/x">link</a></p>' }
    expect(rt.fillMarks('<h1>@@title@@</h1>', values)).toBe('<h1>A &amp; B &lt;script&gt;</h1>')
    expect(rt.fillMarks('<div>@@body_html@@</div>', values)).toBe('<div><p>Body <a href="/x">link</a></p></div>')
  })

  it('repeat blocks render once per item with the given separator', () => {
    const tpl = '<span><!--@@repeat:terms|, @@--><a href="/t/@@item@@/">@@item@@</a><!--@@/repeat@@--></span>'
    expect(rt.renderTemplate(tpl, { terms: ['news', 'events'] })).toBe(
      '<span><a href="/t/news/">news</a>, <a href="/t/events/">events</a></span>',
    )
    // the whole block disappears when the list is empty — no stray separators
    expect(rt.renderTemplate(tpl, { terms: [] })).toBe('<span></span>')
    // a three-term template applied to a six-term post prints six (finding #9)
    const six = rt.renderTemplate(tpl, { terms: ['a', 'b', 'c', 'd', 'e', 'f'] })
    expect(six.match(/<a /g)).toHaveLength(6)
    expect(six.endsWith('</a></span>')).toBe(true)
  })

  it('repeat exposes object item fields as item_<key> and an index', () => {
    const tpl = '<!--@@repeat:authors@@--><b data-i="@@item_index@@">@@item_name@@</b><!--@@/repeat@@-->'
    expect(rt.renderTemplate(tpl, { authors: [{ name: 'Ada' }, { name: 'Alan' }] })).toBe(
      '<b data-i="0">Ada</b><b data-i="1">Alan</b>',
    )
  })

  it('conditional blocks survive only when the value is filled', () => {
    const tpl = '<!--@@if:feat@@--><figure>@@feat@@</figure><!--@@/if@@-->rest'
    expect(rt.renderTemplate(tpl, { feat: 'hero.jpg' })).toBe('<figure>hero.jpg</figure>rest')
    expect(rt.renderTemplate(tpl, { feat: '' })).toBe('rest')
    const negated = '<!--@@if:!feat@@--><div class="no-hero"></div><!--@@/if@@-->'
    expect(rt.renderTemplate(negated, { feat: '' })).toBe('<div class="no-hero"></div>')
    expect(rt.renderTemplate(negated, { feat: 'x' })).toBe('')
  })

  it('conditionals inside a repeat see per-item values', () => {
    const tpl = '<!--@@repeat:items@@--><li><!--@@if:item_badge@@--><em>@@item_badge@@</em><!--@@/if@@-->@@item_name@@</li><!--@@/repeat@@-->'
    expect(rt.renderTemplate(tpl, { items: [{ name: 'a', badge: 'new' }, { name: 'b' }] })).toBe(
      '<li><em>new</em>a</li><li>b</li>',
    )
  })

  it('composeBody splices content at the marker and renders both sides', () => {
    const chrome = '<article><h1>@@title@@</h1><div class="entry-content"><!--@@body@@--></div></article>'
    expect(rt.composeBody(chrome, { title: 'T' }, '<p>BODY</p>')).toBe(
      '<article><h1>T</h1><div class="entry-content"><p>BODY</p></div></article>',
    )
  })

  it('postMarks exposes lists for repeats and _html variants for raw insertion', () => {
    const marks = rt.postMarks({
      slug: 'hello',
      title: 'Hello',
      body: '<p>B</p>',
      terms: ['news', 'events'],
      author: 'Ada',
      excerpt: 'plain',
      marks: { term_name: 'News' },
    })
    expect(marks.terms).toEqual(['news', 'events'])
    expect(marks.authors).toEqual(['Ada'])
    expect(marks.body_html).toBe('<p>B</p>')
    expect(marks.excerpt_html).toBe('plain')
    expect(marks.term0).toBe('news')
    expect(marks.term_name).toBe('News') // producer extras win
  })

  it('an array used as a plain mark joins instead of leaving stray separators', () => {
    expect(rt.fillMarks('<p>@@terms@@</p>', { terms: ['a', 'b'] })).toBe('<p>a, b</p>')
  })

  it('renderSections gives the first items their own template and wrapper', () => {
    // The measured class: newest post as a big card, the rest in a grid.
    const sections = [
      { template: '<article class="hero">@@title@@</article>', wrapper: '<div class="hero-wrap"><!--@@items@@--></div>', count: 1 },
      { template: '<article class="card">@@title@@</article>', wrapper: '<div class="grid"><!--@@items@@--></div>' },
    ]
    const items = [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }, { slug: 'c', title: 'C' }]
    expect(rt.renderSections(sections, items, rt.postMarks)).toBe(
      '<div class="hero-wrap"><article class="hero">A</article></div>' +
        '<div class="grid"><article class="card">B</article><article class="card">C</article></div>',
    )
  })

  it('a section with no items left is skipped, wrapper and all', () => {
    const sections = [
      { template: '<b>@@title@@</b>', count: 1 },
      { template: '<i>@@title@@</i>', wrapper: '<div class="grid"><!--@@items@@--></div>' },
    ]
    expect(rt.renderSections(sections, [{ slug: 'a', title: 'A' }], rt.postMarks)).toBe('<b>A</b>')
  })

  it('cssHref points at the emitted legacy stylesheet directory', () => {
    expect(rt.cssHref('post-11368.css')).toBe('/styles/legacy/post-11368.css')
    expect(rt.cssHref('local/global-11368-frontend.css')).toBe('/styles/legacy/global-11368-frontend.css')
  })
})
