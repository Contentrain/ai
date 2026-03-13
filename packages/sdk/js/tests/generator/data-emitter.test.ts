import { describe, it, expect } from 'vitest'
import { emitDataModules } from '../../src/generator/data-emitter.js'
import type { ModelDefinition } from '@contentrain/types'
import type { ContentFileRef } from '../../src/generator/config-reader.js'
import { join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const FIXTURE = join(import.meta.dirname, '../fixtures/basic-blog')

describe('data-emitter', () => {
  it('transforms collection object-map to array', async () => {
    const models: ModelDefinition[] = [{
      id: 'blog-post', name: 'Blog Post', kind: 'collection', domain: 'blog', i18n: true,
    }]
    const contentFiles: ContentFileRef[] = [{
      modelId: 'blog-post',
      locale: 'en',
      filePath: join(FIXTURE, '.contentrain/content/blog/blog-post/en.json'),
      kind: 'collection',
    }]

    const modules = await emitDataModules(models, contentFiles)
    expect(modules).toHaveLength(1)
    expect(modules[0]!.fileName).toBe('blog-post.en.mjs')

    // Parse the exported default
    const content = modules[0]!.content
    expect(content).toContain('export default')
    expect(content).toContain('"id": "a1b2c3d4e5f6"')
    expect(content).toContain('"title": "Getting Started with Contentrain"')

    // Entries should be sorted by id
    const jsonStr = content.replace('export default ', '').trim()
    const parsed = JSON.parse(jsonStr) as Array<{ id: string }>
    const ids = parsed.map(e => e.id)
    expect(ids).toEqual([...ids].toSorted())
  })

  it('passes through singleton data', async () => {
    const models: ModelDefinition[] = [{
      id: 'hero', name: 'Hero', kind: 'singleton', domain: 'marketing', i18n: true,
    }]
    const contentFiles: ContentFileRef[] = [{
      modelId: 'hero',
      locale: 'en',
      filePath: join(FIXTURE, '.contentrain/content/marketing/hero/en.json'),
      kind: 'singleton',
    }]

    const modules = await emitDataModules(models, contentFiles)
    expect(modules).toHaveLength(1)
    expect(modules[0]!.fileName).toBe('hero.en.mjs')
    expect(modules[0]!.content).toContain('"title": "Welcome to Contentrain"')
  })

  it('parses document markdown with frontmatter and slug from ref', async () => {
    const models: ModelDefinition[] = [{
      id: 'blog-article', name: 'Blog Article', kind: 'document', domain: 'blog', i18n: true,
    }]
    const contentFiles: ContentFileRef[] = [{
      modelId: 'blog-article',
      locale: 'en',
      filePath: join(FIXTURE, '.contentrain/content/blog/blog-article/welcome-post/en.md'),
      kind: 'document',
      slug: 'welcome-post',
    }]

    const modules = await emitDataModules(models, contentFiles)
    expect(modules).toHaveLength(1)
    expect(modules[0]!.fileName).toBe('blog-article--welcome-post.en.mjs')

    const content = modules[0]!.content
    expect(content).toContain('export default')
    expect(content).toContain('"slug": "welcome-post"')
    expect(content).toContain('"title": "Welcome to Contentrain"')
    expect(content).toContain('"content": "# Welcome')
    // Keys should be sorted (canonical)
    const jsonStr = content.replace('export default ', '').trim()
    const parsed = JSON.parse(jsonStr)
    const keys = Object.keys(parsed)
    expect(keys).toEqual([...keys].toSorted())
  })

  it('passes through dictionary data', async () => {
    const models: ModelDefinition[] = [{
      id: 'error-messages', name: 'Errors', kind: 'dictionary', domain: 'system', i18n: true,
    }]
    const contentFiles: ContentFileRef[] = [{
      modelId: 'error-messages',
      locale: 'tr',
      filePath: join(FIXTURE, '.contentrain/content/system/error-messages/tr.json'),
      kind: 'dictionary',
    }]

    const modules = await emitDataModules(models, contentFiles)
    expect(modules).toHaveLength(1)
    expect(modules[0]!.fileName).toBe('error-messages.tr.mjs')
    expect(modules[0]!.content).toContain('"not_found": "Sayfa bulunamadı"')
  })

  it('parses nested object frontmatter fields for documents', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'contentrain-sdk-frontmatter-'))

    try {
      const docPath = join(tempRoot, 'landing-page.md')
      await mkdir(tempRoot, { recursive: true })
      await writeFile(docPath, `---
title: "Landing"
seo:
  title: "SEO Title"
  noindex: true
---
# Landing

Body.`, 'utf-8')

      const models: ModelDefinition[] = [{
        id: 'page',
        name: 'Page',
        kind: 'document',
        domain: 'site',
        i18n: false,
        fields: {
          title: { type: 'string', required: true },
          seo: {
            type: 'object',
            fields: {
              title: { type: 'string' },
              noindex: { type: 'boolean' },
            },
          },
        },
      }]

      const refs: ContentFileRef[] = [{
        modelId: 'page',
        locale: null,
        filePath: docPath,
        kind: 'document',
        slug: 'landing-page',
      }]

      const modules = await emitDataModules(models, refs)
      const parsed = JSON.parse(modules[0]!.content.replace('export default ', '').trim()) as Record<string, unknown>

      expect(parsed['seo']).toEqual({ title: 'SEO Title', noindex: true })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
