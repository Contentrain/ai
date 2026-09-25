// The source's layout and design as the starter's settings: footer menus,
// the single post's layout, post lists, theme roles the starter leaves to the
// kit's fallbacks, and what the writer reports it cannot honour.

import type { PlanSite, ProjectPlan } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { STARTER_COVERED, unfulfilledFontRoles } from '../src/generate/index'
import { siteConfigSource, themeSource } from '../src/generate/site'

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

  it('keeps the starter\'s own layout when the plan says nothing', () => {
    const out = siteConfigSource(STARTER_CONFIG, site())
    expect(out).toContain(`post: { header: ['terms', 'title', 'byline', 'cover'], adjacent: false, more: 0 },`)
    expect(out).toContain(`lists: { display: 'cards', heading: false },`)
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
    expect(out).toContain('[data-kit-section]:not([data-kit-spacing="none"]) { padding-block: var(--spacing-section); }')
    expect(out).not.toContain('main h1')
    expect(out).not.toContain('[data-kit-text]')
    expect(out.indexOf('main h2')).toBeGreaterThan(out.indexOf(':root'))
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
