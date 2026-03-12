import { describe, it, expect } from 'vitest'
import { QueryBuilder } from '../../src/runtime/query.js'

interface Post {
  id: string
  title: string
  status: string
  views: number
  featured: boolean
  category: string
}

const EN_DATA: Post[] = [
  { id: '1', title: 'First Post', status: 'published', views: 100, featured: true, category: 'tech' },
  { id: '2', title: 'Second Post', status: 'draft', views: 50, featured: false, category: 'design' },
  { id: '3', title: 'Third Post', status: 'published', views: 200, featured: true, category: 'tech' },
]

const TR_DATA: Post[] = [
  { id: '1', title: 'İlk Yazı', status: 'published', views: 100, featured: true, category: 'tech' },
  { id: '2', title: 'İkinci Yazı', status: 'draft', views: 50, featured: false, category: 'design' },
]

function createBuilder() {
  const data = new Map<string, Post[]>()
  data.set('en', EN_DATA)
  data.set('tr', TR_DATA)
  return new QueryBuilder(data)
}

describe('QueryBuilder', () => {
  it('returns all items for a locale', () => {
    const result = createBuilder().locale('en').all()
    expect(result).toHaveLength(3)
  })

  it('returns items from first locale when no locale set', () => {
    const result = createBuilder().all()
    expect(result.length).toBeGreaterThan(0)
  })

  it('filters with where()', () => {
    const result = createBuilder().locale('en').where('status', 'published').all()
    expect(result).toHaveLength(2)
    expect(result.every(p => p.status === 'published')).toBe(true)
  })

  it('chains multiple where()', () => {
    const result = createBuilder()
      .locale('en')
      .where('status', 'published')
      .where('category', 'tech')
      .all()
    expect(result).toHaveLength(2)
    expect(result.every(p => p.status === 'published' && p.category === 'tech')).toBe(true)
  })

  it('sorts ascending', () => {
    const result = createBuilder().locale('en').sort('views', 'asc').all()
    expect(result[0]!.views).toBe(50)
    expect(result[2]!.views).toBe(200)
  })

  it('sorts descending', () => {
    const result = createBuilder().locale('en').sort('views', 'desc').all()
    expect(result[0]!.views).toBe(200)
    expect(result[2]!.views).toBe(50)
  })

  it('limits results', () => {
    const result = createBuilder().locale('en').limit(2).all()
    expect(result).toHaveLength(2)
  })

  it('offsets results', () => {
    const result = createBuilder().locale('en').offset(1).all()
    expect(result).toHaveLength(2)
  })

  it('first() returns first item', () => {
    const result = createBuilder().locale('en').first()
    expect(result).toBeDefined()
    expect(result!.id).toBe('1')
  })

  it('first() returns undefined for empty result', () => {
    const result = createBuilder().locale('en').where('status', 'nonexistent').first()
    expect(result).toBeUndefined()
  })

  it('returns empty array for unknown locale', () => {
    const result = createBuilder().locale('fr').all()
    expect(result).toHaveLength(0)
  })
})
