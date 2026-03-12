import { describe, it, expect } from 'vitest'
import { DocumentQuery } from '../../src/runtime/document.js'

interface Article {
  slug: string
  title: string
  category: string
  content: string
}

const EN_DATA: Article[] = [
  { slug: 'welcome-post', title: 'Welcome to Contentrain', category: 'tech', content: '# Welcome\n\nBody here.' },
  { slug: 'design-tips', title: 'Design Tips', category: 'design', content: '# Design\n\nTips here.' },
  { slug: 'advanced-git', title: 'Advanced Git', category: 'tech', content: '# Git\n\nAdvanced stuff.' },
]

const TR_DATA: Article[] = [
  { slug: 'welcome-post', title: 'Contentrain\'a Hoşgeldiniz', category: 'tech', content: '# Hoşgeldiniz\n\nİçerik burada.' },
  { slug: 'design-tips', title: 'Tasarım İpuçları', category: 'design', content: '# Tasarım\n\nİpuçları burada.' },
]

function createQuery() {
  const data = new Map<string, Article[]>()
  data.set('en', EN_DATA)
  data.set('tr', TR_DATA)
  return new DocumentQuery(data)
}

describe('DocumentQuery', () => {
  it('returns all documents for a locale', () => {
    const result = createQuery().locale('en').all()
    expect(result).toHaveLength(3)
  })

  it('returns documents from first locale when no locale set', () => {
    const result = createQuery().all()
    expect(result).toHaveLength(3)
    expect(result[0]!.slug).toBe('welcome-post')
  })

  it('finds document by slug', () => {
    const result = createQuery().locale('en').bySlug('design-tips')
    expect(result).toBeDefined()
    expect(result!.title).toBe('Design Tips')
    expect(result!.content).toContain('# Design')
  })

  it('finds document by slug in different locale', () => {
    const result = createQuery().locale('tr').bySlug('welcome-post')
    expect(result).toBeDefined()
    expect(result!.title).toBe('Contentrain\'a Hoşgeldiniz')
  })

  it('returns undefined for unknown slug', () => {
    const result = createQuery().locale('en').bySlug('nonexistent')
    expect(result).toBeUndefined()
  })

  it('filters with where()', () => {
    const result = createQuery().locale('en').where('category', 'tech').all()
    expect(result).toHaveLength(2)
    expect(result.every(d => d.category === 'tech')).toBe(true)
  })

  it('chains where() with bySlug()', () => {
    // bySlug doesn't use filters — it searches raw data
    const result = createQuery().locale('en').bySlug('welcome-post')
    expect(result).toBeDefined()
    expect(result!.category).toBe('tech')
  })

  it('first() returns first document', () => {
    const result = createQuery().locale('en').first()
    expect(result).toBeDefined()
    expect(result!.slug).toBe('welcome-post')
  })

  it('first() returns undefined for empty result', () => {
    const result = createQuery().locale('en').where('category', 'nonexistent' as string).first()
    expect(result).toBeUndefined()
  })

  it('returns empty array for unknown locale', () => {
    const result = createQuery().locale('fr').all()
    expect(result).toHaveLength(0)
  })

  it('bySlug returns undefined for unknown locale', () => {
    const result = createQuery().locale('fr').bySlug('welcome-post')
    expect(result).toBeUndefined()
  })

  it('handles empty data map', () => {
    const q = new DocumentQuery(new Map())
    expect(q.all()).toEqual([])
    expect(q.first()).toBeUndefined()
    expect(q.bySlug('test')).toBeUndefined()
  })
})
