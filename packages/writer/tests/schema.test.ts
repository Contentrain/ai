import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModelDefinition } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { collectionName, contentConfigSource, modelSchema } from '../src/generate/schema'

const STARTER = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter')

describe('contentConfigSource', () => {
  it('is what templates/astro-starter/src/content.config.ts holds — one generator, no hand-kept copy', async () => {
    const dir = join(STARTER, '.contentrain', 'models')
    const models = await Promise.all((await readdir(dir)).map(async file => JSON.parse(await readFile(join(dir, file), 'utf8')) as ModelDefinition))
    expect(await readFile(join(STARTER, 'src', 'content.config.ts'), 'utf8')).toBe(contentConfigSource(models))
  })
})

describe('modelSchema', () => {
  const known = new Set(['posts', 'categories', 'media'])
  const model = (fields: ModelDefinition['fields'], kind: ModelDefinition['kind'] = 'collection'): ModelDefinition =>
    ({ id: 'posts', name: 'Posts', kind, domain: 'blog', i18n: false, title_field: 'title', fields })

  it('maps field types, required-ness and defaults', () => {
    const schema = modelSchema(model({
      title: { type: 'string', required: true },
      body: { type: 'richtext' },
      price: { type: 'decimal' },
      count: { type: 'integer', default: 3 },
      live: { type: 'boolean' },
      at: { type: 'datetime' },
      kind: { type: 'select', options: ['a', "b'c"] },
      cover: { type: 'relation', model: 'media' },
      categories: { type: 'relations', model: 'categories' },
      parent: { type: 'relation', model: ['posts', 'pages'] },
      tags: { type: 'array', items: 'string' },
      seo: { type: 'object', fields: { title: { type: 'string' } } },
    }), known)
    expect(schema).toContain('title: z.string(),')
    expect(schema).toContain('body: z.string().optional(),')
    expect(schema).toContain('price: z.number().optional(),')
    expect(schema).toContain('count: z.number().int().default(3),')
    expect(schema).toContain('live: z.boolean().default(false),')
    expect(schema).toContain('at: z.coerce.date().optional(),')
    expect(schema).toContain("kind: z.enum(['a', 'b\\'c']).optional(),")
    expect(schema).toContain("cover: reference('media').optional(),")
    expect(schema).toContain("categories: z.array(reference('categories')).default([]),")
    expect(schema).toContain('parent: z.object({ model: z.string(), ref: z.string() }).optional(),')
    expect(schema).toContain('tags: z.array(z.string()).optional(),')
    expect(schema).toMatch(/seo: z\.object\(\{\n\s+title: z\.string\(\)\.optional\(\),\n\s+\}\)\.optional\(\),/)
    expect(schema).toContain('id: z.string(),')
  })

  it('shapes dictionaries and documents as the loader emits them', () => {
    expect(modelSchema({ ...model(undefined, 'dictionary'), i18n: true }, known)).toBe('z.object({ key: z.string(), value: z.string(), locale: z.string().optional() })')
    expect(modelSchema(model({ title: { type: 'string', required: true } }, 'document'), known)).toContain('slug: z.string(),')
  })

  it('names collections in camelCase', () => {
    expect(collectionName('menu-items')).toBe('menuItems')
    expect(collectionName('ui-strings')).toBe('uiStrings')
    expect(collectionName('case_study')).toBe('caseStudy')
  })
})
