import { describe, expect, it } from 'vitest'
import { footerLinkSizeClasses, footerVars } from '../components/footer/footer'

const packed = { layout: 'columns', columnCount: 2, pack: 'end', narrow: 'row', packGap: '128px', packGapNarrow: '70px', linkSize: '17.88px' } as const

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
