import { describe, expect, it } from 'vitest'
import type { FieldDef } from '@contentrain/types'
import {
  isStoredMediaPath,
  rewriteEntryMedia,
  rewriteFieldMedia,
  rewriteMarkdownMedia,
  rewriteMediaUrl,
  toDeliveryUrl,
} from '../../src/core/media/media-rewrite.js'

const BASE = 'https://cdn.test/api/cdn/v1/proj'

describe('media-rewrite', () => {
  describe('isStoredMediaPath', () => {
    it('matches relative media paths only', () => {
      expect(isStoredMediaPath('media/original/x.webp')).toBe(true)
    })
    it('rejects external URLs, protocol-relative, data URIs and non-strings', () => {
      expect(isStoredMediaPath('https://images.unsplash.com/y.jpg')).toBe(false)
      expect(isStoredMediaPath('//cdn.example/z.jpg')).toBe(false)
      expect(isStoredMediaPath('data:image/png;base64,AAAA')).toBe(false)
      expect(isStoredMediaPath('hello')).toBe(false)
      expect(isStoredMediaPath(null)).toBe(false)
      expect(isStoredMediaPath(42)).toBe(false)
    })
  })

  describe('toDeliveryUrl', () => {
    it('joins base and path', () => {
      expect(toDeliveryUrl(BASE, 'media/a.webp')).toBe(`${BASE}/media/a.webp`)
    })
    it('tolerates a trailing slash on the base', () => {
      expect(toDeliveryUrl(`${BASE}/`, 'media/a.webp')).toBe(`${BASE}/media/a.webp`)
    })
  })

  describe('rewriteMediaUrl', () => {
    it('rewrites stored paths, passes external/absolute through (idempotent)', () => {
      expect(rewriteMediaUrl(BASE, 'media/a.webp')).toBe(`${BASE}/media/a.webp`)
      expect(rewriteMediaUrl(BASE, 'https://ext.example/c.jpg')).toBe('https://ext.example/c.jpg')
      // already-absolute delivery URL is not `media/...` → untouched on re-run
      expect(rewriteMediaUrl(BASE, `${BASE}/media/a.webp`)).toBe(`${BASE}/media/a.webp`)
    })
  })

  describe('rewriteFieldMedia', () => {
    it('rewrites media fields, leaves non-media and nullish values', () => {
      expect(rewriteFieldMedia('media/a.webp', { type: 'image' }, BASE)).toBe(`${BASE}/media/a.webp`)
      expect(rewriteFieldMedia('media/a.webp', { type: 'string' }, BASE)).toBe('media/a.webp')
      expect(rewriteFieldMedia(null, { type: 'image' }, BASE)).toBeNull()
    })
    it('recurses into array item defs', () => {
      const out = rewriteFieldMedia(
        ['media/a.webp', 'https://ext.example/c.jpg'],
        { type: 'array', items: 'image' },
        BASE,
      )
      expect(out).toEqual([`${BASE}/media/a.webp`, 'https://ext.example/c.jpg'])
    })
    it('recurses into object field defs', () => {
      const out = rewriteFieldMedia(
        { og: 'media/d.webp' },
        { type: 'object', fields: { og: { type: 'image' } } },
        BASE,
      )
      expect(out).toEqual({ og: `${BASE}/media/d.webp` })
    })
  })

  describe('rewriteEntryMedia', () => {
    const fields: Record<string, FieldDef> = {
      title: { type: 'string' },
      cover: { type: 'image' },
      gallery: { type: 'array', items: 'image' },
      seo: { type: 'object', fields: { og: { type: 'image' } } },
    }

    it('rewrites media fields incl. nested array/object, leaves others', () => {
      const out = rewriteEntryMedia({
        title: 'media/not-a-field-value-but-string',
        cover: 'media/original/a.webp',
        gallery: ['media/original/b.webp', 'https://ext.example/c.jpg'],
        seo: { og: 'media/original/d.webp' },
      }, fields, BASE)

      expect(out['title']).toBe('media/not-a-field-value-but-string')
      expect(out['cover']).toBe(`${BASE}/media/original/a.webp`)
      expect((out['gallery'] as string[])[0]).toBe(`${BASE}/media/original/b.webp`)
      expect((out['gallery'] as string[])[1]).toBe('https://ext.example/c.jpg')
      expect((out['seo'] as Record<string, unknown>)['og']).toBe(`${BASE}/media/original/d.webp`)
    })

    it('does not mutate the input object', () => {
      const input = { cover: 'media/original/a.webp' }
      const out = rewriteEntryMedia(input, { cover: { type: 'image' } }, BASE)
      expect(input.cover).toBe('media/original/a.webp')
      expect(out['cover']).toBe(`${BASE}/media/original/a.webp`)
    })
  })

  describe('rewriteMarkdownMedia', () => {
    it('rewrites markdown image/link targets and inline html, skips external', () => {
      const body = 'A ![alt](media/original/a.webp) and [d](media/original/b.pdf) and <img src="media/original/c.png"> and ![x](https://ext.example/y.jpg).'
      const out = rewriteMarkdownMedia(body, BASE)
      expect(out).toContain(`](${BASE}/media/original/a.webp)`)
      expect(out).toContain(`](${BASE}/media/original/b.pdf)`)
      expect(out).toContain(`src="${BASE}/media/original/c.png"`)
      expect(out).toContain('](https://ext.example/y.jpg)')
    })

    it('is idempotent — a second pass changes nothing', () => {
      const body = 'A ![alt](media/original/a.webp) and <img src="media/original/c.png">.'
      const once = rewriteMarkdownMedia(body, BASE)
      expect(rewriteMarkdownMedia(once, BASE)).toBe(once)
    })
  })
})
