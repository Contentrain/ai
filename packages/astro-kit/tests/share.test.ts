import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// The starter's link-preview rule (og:title / og:description, the props SEO.astro prints). The starter is a project of
// its own, so the module is compiled here, as direction.test.ts does.
const source = await readFile(join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter', 'src', 'lib', 'share.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { shareTitle, shareDescription } = await import(`data:text/javascript,${encodeURIComponent(js)}`) as {
  shareTitle: (input: { own?: string, seoTitle?: string, title?: string, isHome: boolean, documentTitle: string }) => string
  shareDescription: (input: { own?: string, description?: string }) => string | undefined
}

describe('templates/astro-starter shareTitle (og:title, twitter:title)', () => {
  it("the source's own og:title wins over the page title and the document title", () => {
    expect(shareTitle({ own: 'Contact Us', title: 'Contact', isHome: false, documentTitle: 'Contact – WP Tavern' })).toBe('Contact Us')
  })

  it('without one, an SEO title written for the page, as Yoast and Rank Math fall back to it', () => {
    expect(shareTitle({ seoTitle: 'What a careful WordPress migration keeps', title: 'What a careful migration keeps', isHome: false, documentTitle: 'What a careful WordPress migration keeps' })).toBe('What a careful WordPress migration keeps')
    expect(shareTitle({ own: 'Contact Us', seoTitle: 'Contact Us – WP Tavern', title: 'Contact', isHome: false, documentTitle: 'Contact Us – WP Tavern' })).toBe('Contact Us')
  })

  it('without either, the page title without the site suffix (not the document title)', () => {
    expect(shareTitle({ title: 'Contact Us', isHome: false, documentTitle: 'Contact Us – WP Tavern' })).toBe('Contact Us')
    expect(shareTitle({ own: '  ', title: 'About', isHome: false, documentTitle: 'About – WP Tavern' })).toBe('About')
  })

  it('the home, which has no title of its own, keeps the document title; a home og:title still wins', () => {
    expect(shareTitle({ isHome: true, documentTitle: 'WP Tavern – News' })).toBe('WP Tavern – News')
    expect(shareTitle({ title: 'Home', isHome: true, documentTitle: 'WP Tavern – News' })).toBe('WP Tavern – News')
    expect(shareTitle({ own: 'WP Tavern', isHome: true, documentTitle: 'WP Tavern – News' })).toBe('WP Tavern')
  })
})

describe('templates/astro-starter shareDescription (og:description, twitter:description)', () => {
  it("the source's own og:description comes before the meta description", () => {
    expect(shareDescription({ own: 'Write to us.', description: 'Office hours.' })).toBe('Write to us.')
  })

  it('without one, the meta description as it is (the source one or the composed one); none, none', () => {
    expect(shareDescription({ description: 'Office hours.' })).toBe('Office hours.')
    expect(shareDescription({ own: '', description: 'Contact – WP Tavern. News.' })).toBe('Contact – WP Tavern. News.')
    expect(shareDescription({})).toBeUndefined()
  })
})
