import { describe, it, expect } from 'vitest'
import { resolveMediaUrl, resolveMediaRefsInBody } from '../../src/shared/media.js'

describe('resolveMediaUrl', () => {
  it('resolves a stored media/... path against the base', () => {
    expect(resolveMediaUrl('media/original/hero.webp', 'https://cdn.test'))
      .toBe('https://cdn.test/media/original/hero.webp')
  })

  it('trims trailing slashes from the base', () => {
    expect(resolveMediaUrl('media/hero.webp', 'https://cdn.test/proj///'))
      .toBe('https://cdn.test/proj/media/hero.webp')
  })

  it('leaves an already-absolute URL untouched', () => {
    expect(resolveMediaUrl('https://images.unsplash.com/x.jpg', 'https://cdn.test'))
      .toBe('https://images.unsplash.com/x.jpg')
  })

  it('is a no-op with no base — opt-in, nothing configured means nothing changes', () => {
    expect(resolveMediaUrl('media/hero.webp', undefined)).toBe('media/hero.webp')
    expect(resolveMediaUrl('media/hero.webp', null)).toBe('media/hero.webp')
    expect(resolveMediaUrl('media/hero.webp', '')).toBe('media/hero.webp')
  })

  it('passes non-string values through unchanged', () => {
    expect(resolveMediaUrl(undefined, 'https://cdn.test')).toBeUndefined()
    expect(resolveMediaUrl(null, 'https://cdn.test')).toBeNull()
    expect(resolveMediaUrl(42, 'https://cdn.test')).toBe(42)
  })

  it('passes a relative value that is not a media/... path through unchanged', () => {
    expect(resolveMediaUrl('assets/hero.webp', 'https://cdn.test')).toBe('assets/hero.webp')
  })

  it('is idempotent on a value it already resolved', () => {
    const once = resolveMediaUrl('media/hero.webp', 'https://cdn.test') as string
    expect(resolveMediaUrl(once, 'https://cdn.test')).toBe(once)
  })
})

describe('resolveMediaRefsInBody', () => {
  it('resolves both a markdown link and an image embed sharing the ](media/...) shape', () => {
    const md = 'See ![cover](media/original/hero.webp) and [full res](media/original/big.png).'
    expect(resolveMediaRefsInBody(md, 'https://cdn.test')).toBe(
      'See ![cover](https://cdn.test/media/original/hero.webp) and [full res](https://cdn.test/media/original/big.png).',
    )
  })

  it('leaves external and non-media links untouched', () => {
    const md = '[external](https://x.test/y.png) and [relative](assets/y.png)'
    expect(resolveMediaRefsInBody(md, 'https://cdn.test')).toBe(md)
  })

  it('is a no-op with no base', () => {
    const md = '![cover](media/hero.webp)'
    expect(resolveMediaRefsInBody(md, undefined)).toBe(md)
  })

  it('passes a non-string value through unchanged', () => {
    expect(resolveMediaRefsInBody(undefined, 'https://cdn.test')).toBeUndefined()
  })

  it('resolves every occurrence, not just the first', () => {
    const md = '![a](media/a.png) then ![b](media/b.png)'
    expect(resolveMediaRefsInBody(md, 'https://cdn.test')).toBe(
      '![a](https://cdn.test/media/a.png) then ![b](https://cdn.test/media/b.png)',
    )
  })

  it('resolves a titled image embed, keeping the title', () => {
    const md = '![alt](media/original/a.webp "A title") after.'
    expect(resolveMediaRefsInBody(md, 'https://cdn.test')).toBe(
      '![alt](https://cdn.test/media/original/a.webp "A title") after.',
    )
  })

  it('resolves an inline HTML src/href attribute, both quote styles', () => {
    const md = `<img src="media/original/c.png"> and <a href='media/files/brochure.pdf'>Download</a>`
    expect(resolveMediaRefsInBody(md, 'https://cdn.test')).toBe(
      `<img src="https://cdn.test/media/original/c.png"> and <a href='https://cdn.test/media/files/brochure.pdf'>Download</a>`,
    )
  })
})
