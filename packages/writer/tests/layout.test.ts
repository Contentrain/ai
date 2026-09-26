// The source's layout and design as the starter's settings: footer menus,
// the single post's layout, post lists, theme roles the starter leaves to the
// kit's fallbacks, and what the writer reports it cannot honour.

import type { PlanSite, ProjectPlan } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { STARTER_COVERED, unfulfilledFontRoles } from '../src/generate/index'
import { readsStudioJson, siteConfigSource, sourceHostsOf, studioJsonSource, themeSource } from '../src/generate/site'

const STARTER_CONFIG = `export const siteConfig: SiteConfig = {
  menus: { primary: 'primary', footer: ['footer'] },
}
`

const site = (extra: Record<string, unknown> = {}): PlanSite => ({
  url: 'https://golden.test', title: 'Golden Studio', locale: 'en',
  permalinks: { post: '/:slug/', page: '/:path/', category: '/category/:slug/', tag: '/tag/:slug/', author: '/author/:slug/', blog: '/' },
  home: { kind: 'posts' }, postsPerPage: 10, menus: { primary: 'primary', footer: 'footer' }, redirects: {},
  tokens: { roles: {} },
  ...extra,
} as unknown as PlanSite)

describe('siteConfigSource', () => {
  it('writes the footer menus, the post layout and the list display the plan carries', () => {
    const out = siteConfigSource(STARTER_CONFIG, site({
      menus: { primary: 'header', footer: ['footer-1', 'footer-2'] },
      post: { header: ['title', 'cover', 'byline'], adjacent: true, more: 4 },
      lists: { display: 'full', heading: true },
    }), '{title} - {site}')
    expect(out).toContain(`menus: { primary: 'header', footer: ['footer-1', 'footer-2'] },`)
    expect(out).toContain(`post: { header: ['title', 'cover', 'byline'], adjacent: true, more: 4 },`)
    expect(out).toContain(`lists: { display: 'full', heading: true },`)
  })

  it('fixes the source host in code, without www., so its links stay internal after a domain move', () => {
    expect(siteConfigSource(STARTER_CONFIG, site({ url: 'https://WWW.Golden.test/' }))).toContain(`sourceHosts: ['golden.test'],`)
    expect(sourceHostsOf('not a url')).toEqual([])
  })

  it('keeps the starter\'s own layout when the plan says nothing', () => {
    const out = siteConfigSource(STARTER_CONFIG, site())
    expect(out).toContain(`post: { header: ['terms', 'title', 'byline', 'cover'], adjacent: false, more: 0 },`)
    expect(out).toContain(`lists: { display: 'cards', heading: false },`)
  })
})

describe('the Studio binding', () => {
  const studio = { baseUrl: 'https://studio.contentrain.io', projectId: 'p1' }
  const BOUND_CONFIG = `declare const __CONTENTRAIN_STUDIO__: { baseUrl: string, projectId: string } | null

export const siteConfig: SiteConfig = {
  menus: { primary: 'primary', footer: ['footer'] },
  ...(typeof __CONTENTRAIN_STUDIO__ !== 'undefined' && __CONTENTRAIN_STUDIO__ ? { studio: __CONTENTRAIN_STUDIO__ } : {}),
}
`

  it('goes to studio.json when the starter reads it, and the starter keeps its line for it', () => {
    expect(readsStudioJson(BOUND_CONFIG)).toBe(true)
    const out = siteConfigSource(BOUND_CONFIG, site({ studio }))
    expect(out).toContain('  ...(typeof __CONTENTRAIN_STUDIO__ !== \'undefined\' && __CONTENTRAIN_STUDIO__ ? { studio: __CONTENTRAIN_STUDIO__ } : {}),\n}')
    expect(out).not.toContain('studio: { baseUrl')
    expect(JSON.parse(studioJsonSource(site({ studio }))!)).toEqual(studio)
  })

  it('stays a site.config literal for a starter without studio.json, and is absent without a binding', () => {
    expect(readsStudioJson(STARTER_CONFIG)).toBe(false)
    expect(siteConfigSource(STARTER_CONFIG, site({ studio }))).toContain(`studio: { baseUrl: 'https://studio.contentrain.io', projectId: 'p1' },`)
    expect(studioJsonSource(site())).toBeUndefined()
  })
})

describe('themeSource', () => {
  const css = `@theme {\n  --color-accent: #2563eb;\n  --font-sans: var(--font-inter), sans-serif;\n}\n\n@utility x {}\n`

  it('sets the starter\'s roles in @theme and the rest in :root, where no utility pruning drops them', () => {
    const out = themeSource(css, { roles: { 'color-accent': '#111111', 'font-weight-heading': '400', 'radius-control': '9999px' } } as unknown as PlanSite['tokens'])
    expect(out).toContain('--color-accent: #111111;')
    expect(out).toMatch(/:root \{\n {2}--font-weight-heading: 400;\n {2}--radius-control: 9999px;\n\}/)
    expect(out.indexOf(':root')).toBeGreaterThan(out.indexOf('@theme'))
    expect(out).toContain('@utility x {}')
  })

  it('applies the type scale and section rhythm to the kit\'s markers only for the roles the plan sets', () => {
    const out = themeSource(css, { roles: { 'text-heading-2': 'clamp(1.5rem, 3vw, 2rem)', 'text-nav': '1.125rem', 'spacing-section': '5rem' } } as unknown as PlanSite['tokens'])
    expect(out).toContain('main h2 { font-size: var(--text-heading-2); }')
    expect(out).toContain('[data-cr-part="nav-header"] :is(a, summary) { font-size: var(--text-nav); }')
    expect(out).toContain('[data-kit-section]:not([data-kit-spacing="none"]) { padding-block: calc(var(--spacing-section) / 2); }')
    expect(out).not.toContain('main h1')
    expect(out).not.toContain('[data-kit-text]')
    expect(out.indexOf('main h2')).toBeGreaterThan(out.indexOf(':root'))
  })

  it('sizes the site title by where it sits, and the tagline and meta by the theme\'s presets', () => {
    const out = themeSource(css, { roles: { 'text-body': '1.25rem', 'text-heading-2': '2rem', 'font-weight-body': '300' }, extra: { 'text-medium': '1.1rem', 'text-small': '0.875rem' } } as unknown as PlanSite['tokens'])
    expect(out).toContain('header [data-kit-brand] { font-size: var(--text-body); }')
    expect(out).toContain('footer [data-kit-brand] { font-size: var(--text-heading-2); }')
    expect(out).toContain('[data-kit-meta], [data-kit-meta] a { font-weight: var(--font-weight-body); }')
    expect(out).toContain('[data-kit-tagline] { font-size: var(--text-medium); }')
    expect(out).toContain('[data-kit-meta], main figcaption, [data-cr-part="related"] time { font-size: var(--text-small); }')
  })

  it('writes no marker rules for a plan without those roles', () => {
    expect(themeSource(css, { roles: { 'color-accent': '#111111' } } as unknown as PlanSite['tokens'])).not.toContain('Unlayered')
  })
})

describe('what the writer reports', () => {
  it('names a font role whose family ships no file', () => {
    const tokens = { roles: { 'font-sans': 'Manrope, sans-serif', 'font-mono': '"Fira Code", monospace', 'font-serif': 'Georgia, serif' }, fonts: [{ family: 'Fira Code', weight: '400', style: 'normal', files: ['src/assets/fonts/site/fira-code.woff2'] }] } as unknown as ProjectPlan['site']['tokens']
    expect(unfulfilledFontRoles(tokens)).toEqual([
      { role: 'font-sans', value: 'Manrope, sans-serif', reason: 'no font file for Manrope; the page falls back to the next family' },
    ])
  })

  it('counts the post parts, lists, navigation and comments the starter renders as covered', () => {
    for (const element of ['core/post-title', 'core/post-navigation-link', 'core/query', 'core/navigation-submenu', 'core/comments', 'core/site-tagline']) {
      expect(STARTER_COVERED.has(element), element).toBe(true)
    }
    expect(STARTER_COVERED.has('core/latest-comments')).toBe(false)
  })
})
