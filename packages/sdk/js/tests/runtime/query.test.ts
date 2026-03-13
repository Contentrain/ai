import { describe, it, expect } from 'vitest'
import { QueryBuilder } from '../../src/runtime/query.js'
import type { RelationMeta, RelationResolver } from '../../src/runtime/query.js'

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

// ─── Relation Resolution Tests ───

interface PostWithRelations {
  id: string
  title: string
  author: string
  tags: string[]
}

interface Author {
  id: string
  name: string
  email: string
}

interface Tag {
  id: string
  label: string
}

const AUTHORS: Author[] = [
  { id: 'auth01', name: 'Jane Doe', email: 'jane@example.com' },
  { id: 'auth02', name: 'John Smith', email: 'john@example.com' },
]

const TAGS: Tag[] = [
  { id: 'tag01', label: 'JavaScript' },
  { id: 'tag02', label: 'Design' },
  { id: 'tag03', label: 'Tutorial' },
]

const POSTS_WITH_RELS: PostWithRelations[] = [
  { id: 'p1', title: 'Post One', author: 'auth01', tags: ['tag01', 'tag03'] },
  { id: 'p2', title: 'Post Two', author: 'auth02', tags: ['tag02'] },
  { id: 'p3', title: 'Post Three', author: 'auth01', tags: [] },
]

const RELATION_META: Record<string, RelationMeta> = {
  author: { target: 'author', multi: false },
  tags: { target: 'tag', multi: true },
}

const RESOLVER: RelationResolver = (model, id, _locale) => {
  if (model === 'author') return AUTHORS.find(a => a.id === id) as Record<string, unknown> | undefined
  if (model === 'tag') return TAGS.find(t => t.id === id) as Record<string, unknown> | undefined
  return undefined
}

function createRelationBuilder() {
  const data = new Map<string, PostWithRelations[]>()
  data.set('en', POSTS_WITH_RELS)
  return new QueryBuilder(data, RELATION_META, RESOLVER)
}

describe('QueryBuilder — relation resolution', () => {
  it('resolves single relation (one-to-one)', () => {
    const result = createRelationBuilder().locale('en').include('author').first()
    expect(result).toBeDefined()
    expect(result!.author).toEqual({ id: 'auth01', name: 'Jane Doe', email: 'jane@example.com' })
  })

  it('resolves multi relation (one-to-many)', () => {
    const result = createRelationBuilder().locale('en').include('tags').first()
    expect(result).toBeDefined()
    expect(result!.tags).toEqual([
      { id: 'tag01', label: 'JavaScript' },
      { id: 'tag03', label: 'Tutorial' },
    ])
  })

  it('resolves multiple relation fields at once', () => {
    const result = createRelationBuilder().locale('en').include('author', 'tags').first()
    expect(result).toBeDefined()
    expect(result!.author).toEqual({ id: 'auth01', name: 'Jane Doe', email: 'jane@example.com' })
    expect(result!.tags).toEqual([
      { id: 'tag01', label: 'JavaScript' },
      { id: 'tag03', label: 'Tutorial' },
    ])
  })

  it('returns raw IDs without include()', () => {
    const result = createRelationBuilder().locale('en').first()
    expect(result).toBeDefined()
    expect(result!.author).toBe('auth01')
    expect(result!.tags).toEqual(['tag01', 'tag03'])
  })

  it('gracefully returns raw ID when target not found', () => {
    const posts: PostWithRelations[] = [
      { id: 'p1', title: 'Orphan Post', author: 'nonexistent', tags: ['tag01', 'missing'] },
    ]
    const data = new Map<string, PostWithRelations[]>([['en', posts]])
    const builder = new QueryBuilder(data, RELATION_META, RESOLVER)
    const result = builder.locale('en').include('author', 'tags').first()
    expect(result).toBeDefined()
    expect(result!.author).toBe('nonexistent')
    expect(result!.tags).toEqual([
      { id: 'tag01', label: 'JavaScript' },
      'missing',
    ])
  })

  it('handles empty multi-relation array', () => {
    const result = createRelationBuilder().locale('en').include('tags').all()
    const post3 = result.find(p => p.id === 'p3')
    expect(post3).toBeDefined()
    expect(post3!.tags).toEqual([])
  })

  it('ignores unknown fields in include()', () => {
    const result = createRelationBuilder().locale('en').include('nonexistent' as string).first()
    expect(result).toBeDefined()
    expect(result!.author).toBe('auth01')
  })

  it('works with polymorphic relations (model: string[])', () => {
    const polyMeta: Record<string, RelationMeta> = {
      author: { target: ['author', 'tag'], multi: false },
    }
    const data = new Map<string, PostWithRelations[]>([['en', POSTS_WITH_RELS]])
    const builder = new QueryBuilder(data, polyMeta, RESOLVER)
    const result = builder.locale('en').include('author').first()
    expect(result).toBeDefined()
    expect(result!.author).toEqual({ id: 'auth01', name: 'Jane Doe', email: 'jane@example.com' })
  })

  it('resolves polymorphic relation objects using model+ref storage format', () => {
    const polyMeta: Record<string, RelationMeta> = {
      author: { target: ['author', 'tag'], multi: false },
    }
    const posts = [{
      id: 'p1',
      title: 'Polymorphic Post',
      author: { model: 'tag', ref: 'tag02' },
      tags: [],
    }] as unknown as PostWithRelations[]
    const data = new Map<string, PostWithRelations[]>([['en', posts]])
    const builder = new QueryBuilder(data, polyMeta, RESOLVER)
    const result = builder.locale('en').include('author').first()
    expect(result).toBeDefined()
    expect(result!.author).toEqual({ id: 'tag02', label: 'Design' })
  })

  it('include works with filter + pagination', () => {
    const results = createRelationBuilder()
      .locale('en')
      .where('id', 'p2' as string)
      .include('author')
      .all()
    expect(results).toHaveLength(1)
    expect(results[0]!.author).toEqual({ id: 'auth02', name: 'John Smith', email: 'john@example.com' })
  })
})
