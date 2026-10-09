import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { contactKeys, footerLinkSizeClasses, footerVars } from '../components/footer/footer'

const packed = { layout: 'columns', columnCount: 2, pack: 'end', narrow: 'row', packGap: '128px', packGapNarrow: '70px', linkSize: '17.88px' } as const

describe('contact order', () => {
  it('absent, the details print as before: address, phone, email', () => {
    expect(contactKeys(undefined)).toEqual(['address', 'phone', 'email'])
    expect(contactKeys([])).toEqual(['address', 'phone', 'email'])
  })

  it('in the source\'s order, the ones it leaves out after it, unknown and repeated keys dropped', () => {
    expect(contactKeys(['email', 'phone', 'address'])).toEqual(['email', 'phone', 'address'])
    expect(contactKeys(['email'])).toEqual(['email', 'address', 'phone'])
    expect(contactKeys(['fax', 'phone', 'phone'])).toEqual(['phone', 'address', 'email'])
  })
})

describe('footerVars', () => {
  it('without a narrow link size the footer is exactly as before', () => {
    expect(footerVars(packed)).toBe('--footer-columns: 2; --footer-gap: 128px; --footer-gap-narrow: 70px; --footer-link-size: 17.88px')
    expect(footerLinkSizeClasses(packed)).toEqual(['[&_nav_a]:text-[length:var(--footer-link-size)]'])
  })

  it('a narrow link size is its own property and a below-md class that overrides the wide size', () => {
    const withNarrow = { ...packed, linkSizeNarrow: '16.4px' }
    expect(footerVars(withNarrow)).toBe('--footer-columns: 2; --footer-gap: 128px; --footer-gap-narrow: 70px; --footer-link-size: 17.88px; --footer-link-size-narrow: 16.4px')
    expect(footerLinkSizeClasses(withNarrow)).toEqual(['[&_nav_a]:text-[length:var(--footer-link-size)]', 'max-md:[&_nav_a]:text-[length:var(--footer-link-size-narrow)]'])
  })

  it('a narrow link size applies with stacked columns too, and alone', () => {
    expect(footerVars({ layout: 'columns', columnCount: 2, pack: 'end', packGap: '128px', linkSizeNarrow: '16.4px' })).toBe('--footer-columns: 2; --footer-gap: 128px; --footer-link-size-narrow: 16.4px')
    expect(footerLinkSizeClasses({ linkSizeNarrow: '16.4px' })).toEqual(['max-md:[&_nav_a]:text-[length:var(--footer-link-size-narrow)]'])
  })

  it('the simple layout carries no column properties', () => {
    expect(footerVars({ layout: 'simple', columnCount: 1, packGap: '128px' })).toBe('')
  })
})

describe('packed columns kept in a row below md', () => {
  const source = readFileSync(new URL('../components/footer/Footer.astro', import.meta.url), 'utf8')

  it('end the grid with a flexible track, so the spanning brand block does not grow the auto columns', () => {
    expect(source).toContain("row: { inner: 'grid-cols-[repeat(var(--footer-columns),auto)_1fr] justify-start gap-x-[var(--footer-gap-narrow,1.5rem)]' }")
    expect(source).toContain("{ layout: 'columns', pack: 'end', narrow: 'row', class: { inner: '[&>div:first-child]:col-span-full' } }")
  })

  it('leave every md-and-up class as it was: the wide footer is byte-identical', () => {
    expect(source).toContain("columns: { inner: 'grid gap-10 md:grid-cols-[2fr_repeat(var(--footer-columns),1fr)] md:py-16' }")
    expect(source).toContain("class: { inner: 'md:grid-cols-[1fr_repeat(var(--footer-columns),auto)] md:gap-x-[var(--footer-gap,2.5rem)] md:[&>div:first-child]:col-span-1' }")
  })
})
