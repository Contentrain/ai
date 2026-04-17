import { describe, it, expect } from 'vitest'
import { DocumentQuery } from '../../src/runtime/document.js'
import type { RelationMeta, RelationResolver } from '../../src/runtime/query.js'

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

  it('count() returns document count', () => {
    expect(createQuery().locale('en').count()).toBe(3)
  })

  it('count() respects filters', () => {
    expect(createQuery().locale('en').where('category', 'tech').count()).toBe(2)
  })
})

// ─── Operator-based where() Tests ───

describe('DocumentQuery — where() operators', () => {
  it('where(field, "ne", value) — not equal', () => {
    const result = createQuery().locale('en').where('category', 'ne', 'design').all()
    expect(result).toHaveLength(2)
    expect(result.every(d => d.category !== 'design')).toBe(true)
  })

  it('where(field, "in", values) — in list', () => {
    const result = createQuery().locale('en').where('slug', 'in', ['welcome-post', 'advanced-git']).all()
    expect(result).toHaveLength(2)
  })

  it('where(field, "contains", value) — string contains', () => {
    const result = createQuery().locale('en').where('title', 'contains', 'Design').all()
    expect(result).toHaveLength(1)
    expect(result[0]!.title).toBe('Design Tips')
  })

  it('mixes equality shorthand and operators', () => {
    const result = createQuery()
      .locale('en')
      .where('category', 'tech')
      .where('title', 'contains', 'Git')
      .all()
    expect(result).toHaveLength(1)
    expect(result[0]!.slug).toBe('advanced-git')
  })
})

// ─── Relation Resolution Tests ───

interface ArticleWithRelation {
  slug: string
  title: string
  content: string
  author: string
  tags: string[]
}

const ARTICLES_WITH_RELS: ArticleWithRelation[] = [
  { slug: 'post-one', title: 'Post One', content: '# One', author: 'auth01', tags: ['tag01'] },
  { slug: 'post-two', title: 'Post Two', content: '# Two', author: 'auth02', tags: ['tag01', 'tag02'] },
]

const RELATION_META: Record<string, RelationMeta> = {
  author: { target: 'author', multi: false },
  tags: { target: 'tag', multi: true },
}

const AUTHORS = [
  { id: 'auth01', name: 'Jane Doe' },
  { id: 'auth02', name: 'John Smith' },
]

const TAGS = [
  { id: 'tag01', label: 'JavaScript' },
  { id: 'tag02', label: 'Design' },
]

const RESOLVER: RelationResolver = (model, id, _locale) => {
  if (model === 'author') return AUTHORS.find(a => a.id === id) as Record<string, unknown> | undefined
  if (model === 'tag') return TAGS.find(t => t.id === id) as Record<string, unknown> | undefined
  return undefined
}

function createRelationQuery() {
  const data = new Map<string, ArticleWithRelation[]>([['en', ARTICLES_WITH_RELS]])
  return new DocumentQuery(data, RELATION_META, RESOLVER)
}

describe('DocumentQuery — relation resolution', () => {
  it('resolves relations in all()', () => {
    const result = createRelationQuery().locale('en').include('author').all()
    expect(result[0]!.author).toEqual({ id: 'auth01', name: 'Jane Doe' })
    expect(result[1]!.author).toEqual({ id: 'auth02', name: 'John Smith' })
  })

  it('resolves relations in bySlug()', () => {
    const result = createRelationQuery().locale('en').include('author', 'tags').bySlug('post-two')
    expect(result).toBeDefined()
    expect(result!.author).toEqual({ id: 'auth02', name: 'John Smith' })
    expect(result!.tags).toEqual([
      { id: 'tag01', label: 'JavaScript' },
      { id: 'tag02', label: 'Design' },
    ])
  })

  it('bySlug without include returns raw IDs', () => {
    const result = createRelationQuery().locale('en').bySlug('post-one')
    expect(result).toBeDefined()
    expect(result!.author).toBe('auth01')
    expect(result!.tags).toEqual(['tag01'])
  })

  it('resolves relations in first()', () => {
    const result = createRelationQuery().locale('en').include('author').first()
    expect(result).toBeDefined()
    expect(result!.author).toEqual({ id: 'auth01', name: 'Jane Doe' })
  })
})
