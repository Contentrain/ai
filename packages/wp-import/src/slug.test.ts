import { describe, it, expect } from 'vitest'
import type { RawIR } from '@contentrain/types'
import { validateSlug } from '@contentrain/types'
import { parseWxr, rawToContentrain, hexId, slugify } from './index'
import { addressSlug } from './core'
import { FIXTURE } from './wxr.test'

// A slug is the page's address. It is kept as the source served it, in any script; only a slug that leaves no word
// (or collides) falls back, and then the old address is reported for a 301.
describe('addressSlug keeps the address the source served', () => {
  it.each([
    ['%e6%97%a5%e6%9c%ac%e8%aa%9e', '日本語'],
    ['%E6%9D%B1%E4%BA%AC-%E3%82%BF%E3%83%AF%E3%83%BC', '東京-タワー'],
    ['%d9%85%d8%b1%d8%ad%d8%a8%d8%a7-%d8%a8%d8%a7%d9%84%d8%b9%d8%a7%d9%84%d9%85', 'مرحبا-بالعالم'],
    ['%c4%b1%c5%9f%c4%b1k-var', 'ışık-var'],
    ['stra%c3%9fe', 'straße'],
    ['%c3%bcber-uns', 'über-uns'],
    ['Hello World!', 'hello-world'],
    ['café', 'café'],
    ['x  y__z', 'x-y-z'],
  ])('%s → %s', (raw, expected) => {
    expect(addressSlug(raw)).toBe(expected)
    expect(validateSlug(expected)).toBeNull()
  })

  it('is NFC however the source spelled it, and lowercase', () => {
    expect(addressSlug('café')).toBe('café')
    expect(addressSlug('%C3%9Cber')).toBe('über')
    expect(validateSlug(addressSlug('İstanbul'))).toBeNull()
  })

  it('leaves nothing for a slug of only symbols, or one too long for a file name', () => {
    expect(addressSlug('---')).toBe('')
    expect(addressSlug('%f0%9f%98%80')).toBe('')
    expect(addressSlug('あ'.repeat(70))).toBe('')
  })

  it('an English slug comes out byte-identical to what slugify gave', () => {
    for (const slug of ['hello-world', 'About Us', 'my_post-2', 'a--b', '2026-roadmap', 'FAQ', 'x.y/z', 'Spring 2026!'])
      expect(addressSlug(slug)).toBe(slugify(slug))
  })
})

const baseRaw = async (): Promise<RawIR> => (await parseWxr(FIXTURE)).raw
const post = (raw: RawIR, id: number, slug: string, link?: string) => ({ ...raw.posts.find((p) => p.slug === 'hello-world')!, id, slug, link: link ?? null })
const entries = (files: Record<string, string>): Record<string, { slug: string }> => JSON.parse(files['.contentrain/content/blog/posts/data.json']!)

describe('posts keep their Unicode address through the import', () => {
  it('ja / ar / tr / de posts are written under their own slug, which the contract accepts', async () => {
    const raw0 = await baseRaw()
    const slugs = ['%e6%97%a5%e6%9c%ac%e8%aa%9e', '%d9%85%d8%b1%d8%ad%d8%a8%d8%a7', '%c4%b1%c5%9f%c4%b1k', 'stra%c3%9fe-%c3%bcber']
    const raw: RawIR = { ...raw0, posts: [...raw0.posts, ...slugs.map((s, i) => post(raw0, 900 + i, s))] }
    const { files, report } = rawToContentrain(raw, { updatedBy: 'test' })
    const written = Object.values(entries(files)).map((e) => e.slug)
    for (const slug of ['日本語', 'مرحبا', 'ışık', 'straße-über']) {
      expect(written).toContain(slug)
      expect(validateSlug(slug)).toBeNull()
      expect(entries(files)[hexId(`posts:${slug}`)]?.slug).toBe(slug)
    }
    expect(report.slug_moves.filter((m) => m.wp_id >= 900)).toEqual([])
    expect(report.slug_fallback).toBe(0)
  })

  it('an English-only site imports exactly as before: same slugs, no moves', async () => {
    const { files, report } = rawToContentrain(await baseRaw(), { updatedBy: 'test' })
    expect(report.slug_moves).toEqual([])
    expect(Object.values(entries(files)).map((e) => e.slug)).toContain('hello-world')
  })

  it('an empty slug falls back and names the old address for a 301; a colliding one does too', async () => {
    const raw0 = await baseRaw()
    const raw: RawIR = {
      ...raw0,
      posts: [
        ...raw0.posts,
        post(raw0, 910, '---', 'https://old.example/blog/---/'),
        post(raw0, 911, 'twin', 'https://old.example/blog/twin/'),
        post(raw0, 912, 'Twin', 'https://old.example/blog/Twin/'),
      ],
    }
    const { report } = rawToContentrain(raw, { updatedBy: 'test' })
    expect(report.slug_moves).toEqual([
      { wp_id: 910, type: 'post', from: '/blog/---/', slug: 'post-910', reason: 'empty' },
      { wp_id: 912, type: 'post', from: '/blog/Twin/', slug: 'twin-912', reason: 'collision' },
    ])
    expect(report.slug_fallback).toBe(1)
  })

  it('a slug changed for characters outside the alphabet is reported as rewritten, with its old address', async () => {
    const raw0 = await baseRaw()
    const cases: Array<[number, string, string, string]> = [
      // Persian ZWNJ (U+200C), Hindi ZWJ (U+200D), Japanese katakana middle dot, an NFD spelling of "é".
      [920, 'می‌خواهم-رفت', '/fa/می‌خواهم-رفت/', 'می-خواهم-رفت'],
      [921, 'क्‍या', '/hi/क्‍या/', 'क्-या'],
      [922, 'カタカナ・テスト', '/ja/カタカナ・テスト/', 'カタカナ-テスト'],
      [923, 'cafe\u0301', '/cafe\u0301/', 'café'],
    ]
    const raw: RawIR = { ...raw0, posts: [...raw0.posts, ...cases.map(([id, slug, link]) => post(raw0, id, slug, `https://old.example${link}`))] }
    const { report } = rawToContentrain(raw, { updatedBy: 'test' })
    expect(report.slug_moves.filter((m) => m.wp_id >= 920)).toEqual(
      cases.map(([id, , link, slug]) => ({ wp_id: id, type: 'post', from: new URL(`https://old.example${link}`).pathname, slug, reason: 'rewritten' })),
    )
  })

  it('a slug that only differs by case is not a move', async () => {
    const raw0 = await baseRaw()
    const raw: RawIR = { ...raw0, posts: [...raw0.posts, post(raw0, 930, 'Mixed-Case', 'https://old.example/Mixed-Case/')] }
    expect(rawToContentrain(raw, { updatedBy: 'test' }).report.slug_moves).toEqual([])
  })

  it('a collision suffix still fits the 200-byte limit on a long slug', async () => {
    const raw0 = await baseRaw()
    const long = 'あ'.repeat(66) // 198 bytes: valid alone, over the limit once "-<id>" is appended
    const raw: RawIR = { ...raw0, posts: [...raw0.posts, post(raw0, 940, long), post(raw0, 941, long)] }
    const { report, files } = rawToContentrain(raw, { updatedBy: 'test' })
    const move = report.slug_moves.find((m) => m.wp_id === 941)!
    expect(move.reason).toBe('collision')
    expect(move.slug).toBe(`${'あ'.repeat(65)}-941`)
    expect(new TextEncoder().encode(move.slug).length).toBeLessThanOrEqual(200)
    expect(validateSlug(move.slug)).toBeNull()
    expect(Object.values(entries(files)).map((e) => e.slug)).toContain(move.slug)
  })
})
