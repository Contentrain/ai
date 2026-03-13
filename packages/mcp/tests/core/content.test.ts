import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { ModelDefinition, ContentrainConfig } from '@contentrain/types'
import { writeContent, deleteContent, listContent, parseFrontmatter, serializeFrontmatter } from '../../src/core/content-manager.js'
import { readJson, readText, contentrainDir } from '../../src/util/fs.js'

let testDir: string

const config: ContentrainConfig = {
  version: 1,
  stack: 'nuxt',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['marketing', 'blog', 'system'],
}

const singletonModel: ModelDefinition = {
  id: 'hero',
  name: 'Hero Section',
  kind: 'singleton',
  domain: 'marketing',
  i18n: true,
  fields: {
    title: { type: 'string', required: true },
    subtitle: { type: 'text' },
  },
}

const collectionModel: ModelDefinition = {
  id: 'authors',
  name: 'Authors',
  kind: 'collection',
  domain: 'blog',
  i18n: false,
  fields: {
    name: { type: 'string', required: true },
    bio: { type: 'text' },
  },
}

const documentModel: ModelDefinition = {
  id: 'blog-post',
  name: 'Blog Post',
  kind: 'document',
  domain: 'blog',
  i18n: true,
  fields: {
    title: { type: 'string', required: true },
    slug: { type: 'slug', required: true },
    tags: { type: 'array', items: 'string' },
  },
}

const dictionaryModel: ModelDefinition = {
  id: 'error-messages',
  name: 'Error Messages',
  kind: 'dictionary',
  domain: 'system',
  i18n: true,
}

const nonI18nSingletonModel: ModelDefinition = {
  id: 'site-settings',
  name: 'Site Settings',
  kind: 'singleton',
  domain: 'system',
  i18n: false,
  fields: {
    title: { type: 'string', required: true },
  },
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-content-test-'))
  // Create necessary directories
  const crDir = contentrainDir(testDir)
  await mkdir(join(crDir, 'content', 'marketing', 'hero'), { recursive: true })
  await mkdir(join(crDir, 'content', 'blog', 'authors'), { recursive: true })
  await mkdir(join(crDir, 'content', 'blog', 'blog-post'), { recursive: true })
  await mkdir(join(crDir, 'content', 'system', 'error-messages'), { recursive: true })
  await mkdir(join(crDir, 'content', 'system', 'site-settings'), { recursive: true })
  await mkdir(join(crDir, 'meta', 'hero'), { recursive: true })
  await mkdir(join(crDir, 'meta', 'authors'), { recursive: true })
  await mkdir(join(crDir, 'meta', 'blog-post'), { recursive: true })
  await mkdir(join(crDir, 'meta', 'error-messages'), { recursive: true })
  await mkdir(join(crDir, 'meta', 'site-settings'), { recursive: true })
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

// ─── Frontmatter tests ───

describe('parseFrontmatter', () => {
  it('parses frontmatter with body', () => {
    const content = `---
title: Hello World
slug: hello-world
tags:
  - tutorial
  - guide
---

# Hello World

This is the body.`

    const { frontmatter, body } = parseFrontmatter(content)
    expect(frontmatter['title']).toBe('Hello World')
    expect(frontmatter['slug']).toBe('hello-world')
    expect(frontmatter['tags']).toEqual(['tutorial', 'guide'])
    expect(body).toContain('# Hello World')
    expect(body).toContain('This is the body.')
  })

  it('parses inline arrays', () => {
    const content = `---
tags: [one, two, three]
---

Body`

    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter['tags']).toEqual(['one', 'two', 'three'])
  })

  it('parses boolean and number values', () => {
    const content = `---
published: true
count: 42
ratio: 3.14
---

`

    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter['published']).toBe(true)
    expect(frontmatter['count']).toBe(42)
    expect(frontmatter['ratio']).toBe(3.14)
  })
})

describe('serializeFrontmatter', () => {
  it('serializes data with body', () => {
    const data = { title: 'Test', slug: 'test', tags: ['a', 'b'] }
    const body = '# Test\n\nContent here.'
    const result = serializeFrontmatter(data, body)

    expect(result).toContain('---')
    expect(result).toContain('title: Test')
    expect(result).toContain('slug: test')
    expect(result).toContain('  - a')
    expect(result).toContain('  - b')
    expect(result).toContain('# Test')
    expect(result).toContain('Content here.')
  })

  it('excludes body key from frontmatter', () => {
    const data = { title: 'Test', body: 'should not appear in frontmatter' }
    const result = serializeFrontmatter(data, 'actual body')
    expect(result).not.toContain('body: should not appear')
    expect(result).toContain('actual body')
  })
})

// ─── writeContent tests ───

describe('writeContent', () => {
  it('writes singleton content', async () => {
    const results = await writeContent(testDir, singletonModel, [
      { locale: 'en', data: { title: 'Hello', subtitle: 'World' } },
    ], config)

    expect(results).toHaveLength(1)
    expect(results[0]!.action).toBe('updated')
    expect(results[0]!.locale).toBe('en')

    const content = await readJson<Record<string, unknown>>(
      join(contentrainDir(testDir), 'content', 'marketing', 'hero', 'en.json'),
    )
    expect(content!['title']).toBe('Hello')
    expect(content!['subtitle']).toBe('World')
  })

  it('writes singleton for multiple locales', async () => {
    const results = await writeContent(testDir, singletonModel, [
      { locale: 'en', data: { title: 'Hello' } },
      { locale: 'tr', data: { title: 'Merhaba' } },
    ], config)

    expect(results).toHaveLength(2)

    const en = await readJson<Record<string, unknown>>(
      join(contentrainDir(testDir), 'content', 'marketing', 'hero', 'en.json'),
    )
    const tr = await readJson<Record<string, unknown>>(
      join(contentrainDir(testDir), 'content', 'marketing', 'hero', 'tr.json'),
    )
    expect(en!['title']).toBe('Hello')
    expect(tr!['title']).toBe('Merhaba')
  })

  it('writes collection entries with sorted object-map', async () => {
    const results = await writeContent(testDir, collectionModel, [
      { id: 'bbb000000000', locale: 'en', data: { name: 'Bob', bio: 'Writer' } },
      { id: 'aaa000000000', locale: 'en', data: { name: 'Alice', bio: 'Developer' } },
    ], config)

    expect(results).toHaveLength(2)
    expect(results[0]!.action).toBe('created')
    expect(results[0]!.id).toBe('bbb000000000')

    // collectionModel has i18n:false, so content goes to data.json (not locale-based)
    const filePath = join(contentrainDir(testDir), 'content', 'blog', 'authors', 'data.json')
    const content = await readJson<Record<string, Record<string, unknown>>>(filePath)
    const keys = Object.keys(content!)
    expect(keys[0]).toBe('aaa000000000')
    expect(keys[1]).toBe('bbb000000000')
  })

  it('generates ID for new collection entries', async () => {
    const results = await writeContent(testDir, collectionModel, [
      { locale: 'en', data: { name: 'Charlie' } },
    ], config)

    expect(results[0]!.action).toBe('created')
    expect(results[0]!.id).toBeDefined()
    expect(results[0]!.id).toHaveLength(12)
  })

  it('updates existing collection entry', async () => {
    // Create first
    await writeContent(testDir, collectionModel, [
      { id: 'entry001', locale: 'en', data: { name: 'Original' } },
    ], config)

    // Update
    const results = await writeContent(testDir, collectionModel, [
      { id: 'entry001', locale: 'en', data: { name: 'Updated' } },
    ], config)

    expect(results[0]!.action).toBe('updated')

    // collectionModel has i18n:false, so content goes to data.json
    const content = await readJson<Record<string, Record<string, unknown>>>(
      join(contentrainDir(testDir), 'content', 'blog', 'authors', 'data.json'),
    )
    expect(content!['entry001']!['name']).toBe('Updated')
  })

  it('writes document with frontmatter and body', async () => {
    const results = await writeContent(testDir, documentModel, [
      {
        slug: 'hello-world',
        locale: 'en',
        data: {
          title: 'Hello World',
          slug: 'hello-world',
          tags: ['tutorial'],
          body: '# Hello\n\nWelcome!',
        },
      },
    ], config)

    expect(results[0]!.action).toBe('created')
    expect(results[0]!.slug).toBe('hello-world')

    const raw = await readText(
      join(contentrainDir(testDir), 'content', 'blog', 'blog-post', 'hello-world', 'en.md'),
    )
    expect(raw).toContain('title: Hello World')
    expect(raw).toContain('slug: hello-world')
    expect(raw).toContain('# Hello')
    expect(raw).toContain('Welcome!')
  })

  it('writes dictionary key-value pairs', async () => {
    const results = await writeContent(testDir, dictionaryModel, [
      { locale: 'en', data: { 'auth.forbidden': 'Access denied', 'auth.expired': 'Session expired' } },
    ], config)

    expect(results[0]!.action).toBe('updated')

    const content = await readJson<Record<string, string>>(
      join(contentrainDir(testDir), 'content', 'system', 'error-messages', 'en.json'),
    )
    expect(content!['auth.forbidden']).toBe('Access denied')
    expect(content!['auth.expired']).toBe('Session expired')
  })

  it('merges dictionary keys', async () => {
    // Write initial
    await writeContent(testDir, dictionaryModel, [
      { locale: 'en', data: { 'key1': 'value1' } },
    ], config)

    // Merge more
    await writeContent(testDir, dictionaryModel, [
      { locale: 'en', data: { 'key2': 'value2' } },
    ], config)

    const content = await readJson<Record<string, string>>(
      join(contentrainDir(testDir), 'content', 'system', 'error-messages', 'en.json'),
    )
    expect(content!['key1']).toBe('value1')
    expect(content!['key2']).toBe('value2')
  })

  it('writes meta for every content write', async () => {
    await writeContent(testDir, singletonModel, [
      { locale: 'en', data: { title: 'Test' } },
    ], config)

    const meta = await readJson<Record<string, unknown>>(
      join(contentrainDir(testDir), 'meta', 'hero', 'en.json'),
    )
    expect(meta!['status']).toBe('draft')
    expect(meta!['source']).toBe('agent')
    expect(meta!['updated_by']).toBe('contentrain-mcp')
  })
})

// ─── deleteContent tests ───

describe('deleteContent', () => {
  it('removes collection entry from object-map', async () => {
    await writeContent(testDir, collectionModel, [
      { id: 'keep-me', locale: 'en', data: { name: 'Keeper' } },
      { id: 'delete-me', locale: 'en', data: { name: 'Goner' } },
    ], config)

    const removed = await deleteContent(testDir, collectionModel, { id: 'delete-me', locale: 'en' })
    expect(removed).toHaveLength(1)
    expect(removed[0]).toContain('delete-me')

    // collectionModel has i18n:false, so content goes to data.json
    const content = await readJson<Record<string, unknown>>(
      join(contentrainDir(testDir), 'content', 'blog', 'authors', 'data.json'),
    )
    expect(content!['keep-me']).toBeDefined()
    expect(content!['delete-me']).toBeUndefined()
  })

  it('removes document slug directory', async () => {
    await writeContent(testDir, documentModel, [
      { slug: 'to-delete', locale: 'en', data: { title: 'Delete Me', slug: 'to-delete', body: '# Gone' } },
    ], config)

    const removed = await deleteContent(testDir, documentModel, { slug: 'to-delete' })
    expect(removed).toHaveLength(1)
    expect(removed[0]).toContain('to-delete')

    const raw = await readText(
      join(contentrainDir(testDir), 'content', 'blog', 'blog-post', 'to-delete', 'en.md'),
    )
    expect(raw).toBeNull()
  })

  it('removes singleton locale file', async () => {
    await writeContent(testDir, singletonModel, [
      { locale: 'tr', data: { title: 'Merhaba' } },
    ], config)

    const removed = await deleteContent(testDir, singletonModel, { locale: 'tr' })
    expect(removed).toHaveLength(1)

    const content = await readJson(
      join(contentrainDir(testDir), 'content', 'marketing', 'hero', 'tr.json'),
    )
    expect(content).toBeNull()
  })

  it('allows locale-free delete for non-i18n singleton models', async () => {
    await writeContent(testDir, nonI18nSingletonModel, [
      { data: { title: 'Contentrain' } },
    ], config)

    const removed = await deleteContent(testDir, nonI18nSingletonModel, {})
    expect(removed).toHaveLength(1)

    const content = await readJson(
      join(contentrainDir(testDir), 'content', 'system', 'site-settings', 'data.json'),
    )
    expect(content).toBeNull()

    const meta = await readJson(
      join(contentrainDir(testDir), 'meta', 'site-settings', 'en.json'),
    )
    expect(meta).toBeNull()
  })

  it('removes dictionary locale file', async () => {
    await writeContent(testDir, dictionaryModel, [
      { locale: 'en', data: { 'key': 'value' } },
    ], config)

    const removed = await deleteContent(testDir, dictionaryModel, { locale: 'en' })
    expect(removed).toHaveLength(1)

    const content = await readJson(
      join(contentrainDir(testDir), 'content', 'system', 'error-messages', 'en.json'),
    )
    expect(content).toBeNull()
  })
})

// ─── listContent tests ───

describe('listContent', () => {
  it('lists singleton as flat data', async () => {
    await writeContent(testDir, singletonModel, [
      { locale: 'en', data: { title: 'Hello', subtitle: 'World' } },
    ], config)

    const result = await listContent(testDir, singletonModel, { locale: 'en' }, config) as Record<string, unknown>
    expect(result['kind']).toBe('singleton')
    expect((result['data'] as Record<string, unknown>)['title']).toBe('Hello')
  })

  it('lists collection as array with pagination', async () => {
    await writeContent(testDir, collectionModel, [
      { id: 'a001', locale: 'en', data: { name: 'Alice' } },
      { id: 'b002', locale: 'en', data: { name: 'Bob' } },
      { id: 'c003', locale: 'en', data: { name: 'Charlie' } },
    ], config)

    const result = await listContent(testDir, collectionModel, {
      locale: 'en',
      limit: 2,
      offset: 0,
    }, config) as Record<string, unknown>

    expect(result['kind']).toBe('collection')
    expect(result['total']).toBe(3)
    const data = result['data'] as Array<Record<string, unknown>>
    expect(data).toHaveLength(2)
    expect(data[0]!['id']).toBe('a001')
  })

  it('lists collection with filter', async () => {
    await writeContent(testDir, collectionModel, [
      { id: 'a001', locale: 'en', data: { name: 'Alice', bio: 'Dev' } },
      { id: 'b002', locale: 'en', data: { name: 'Bob', bio: 'Writer' } },
    ], config)

    const result = await listContent(testDir, collectionModel, {
      locale: 'en',
      filter: { bio: 'Dev' },
    }, config) as Record<string, unknown>

    const data = result['data'] as Array<Record<string, unknown>>
    expect(data).toHaveLength(1)
    expect(data[0]!['name']).toBe('Alice')
  })

  it('lists documents with frontmatter', async () => {
    await writeContent(testDir, documentModel, [
      { slug: 'post-1', locale: 'en', data: { title: 'Post 1', slug: 'post-1', body: '# P1' } },
      { slug: 'post-2', locale: 'en', data: { title: 'Post 2', slug: 'post-2', body: '# P2' } },
    ], config)

    const result = await listContent(testDir, documentModel, { locale: 'en' }, config) as Record<string, unknown>
    expect(result['kind']).toBe('document')
    expect(result['total']).toBe(2)
    const data = result['data'] as Array<{ slug: string; frontmatter: Record<string, unknown> }>
    expect(data.some(d => d.slug === 'post-1')).toBe(true)
  })

  it('lists dictionary with total_keys', async () => {
    await writeContent(testDir, dictionaryModel, [
      { locale: 'en', data: { 'a': 'A', 'b': 'B', 'c': 'C' } },
    ], config)

    const result = await listContent(testDir, dictionaryModel, { locale: 'en' }, config) as Record<string, unknown>
    expect(result['kind']).toBe('dictionary')
    expect(result['total_keys']).toBe(3)
    expect((result['data'] as Record<string, string>)['a']).toBe('A')
  })
})
