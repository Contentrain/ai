import { describe, it, expect } from 'vitest'
import { emitTypes } from '../../src/generator/type-emitter.js'
import type { ModelDefinition } from '@contentrain/types'

describe('type-emitter', () => {
  it('generates ContentStatus type', () => {
    const result = emitTypes([])
    expect(result).toContain("export type ContentStatus = 'draft' | 'published' | 'in_review' | 'rejected' | 'archived'")
  })

  it('generates collection interface with id field', () => {
    const models: ModelDefinition[] = [{
      id: 'blog-post',
      name: 'Blog Post',
      kind: 'collection',
      domain: 'blog',
      i18n: true,
      fields: {
        title: { type: 'string', required: true },
        views: { type: 'integer' },
      },
    }]
    const result = emitTypes(models)
    expect(result).toContain('export interface BlogPost {')
    expect(result).toContain('  id: string')
    expect(result).toContain('  title: string')
    expect(result).toContain('  views?: number')
  })

  it('generates singleton interface without id', () => {
    const models: ModelDefinition[] = [{
      id: 'hero',
      name: 'Hero',
      kind: 'singleton',
      domain: 'marketing',
      i18n: true,
      fields: {
        title: { type: 'string', required: true },
        cta_url: { type: 'url' },
      },
    }]
    const result = emitTypes(models)
    expect(result).toContain('export interface Hero {')
    expect(result).not.toMatch(/  id: string/)
    expect(result).toContain('  title: string')
    expect(result).toContain('  cta_url?: string')
  })

  it('generates dictionary as Record type', () => {
    const models: ModelDefinition[] = [{
      id: 'error-messages',
      name: 'Errors',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
    }]
    const result = emitTypes(models)
    expect(result).toContain('export type ErrorMessages = Record<string, string>')
  })

  it('generates select as union type', () => {
    const models: ModelDefinition[] = [{
      id: 'blog-post',
      name: 'Blog Post',
      kind: 'collection',
      domain: 'blog',
      i18n: true,
      fields: {
        status: { type: 'select', options: ['draft', 'published', 'archived'] },
      },
    }]
    const result = emitTypes(models)
    expect(result).toContain("'draft' | 'published' | 'archived'")
  })

  it('generates query overloads for collections', () => {
    const models: ModelDefinition[] = [{
      id: 'blog-post',
      name: 'Blog Post',
      kind: 'collection',
      domain: 'blog',
      i18n: true,
    }]
    const result = emitTypes(models)
    expect(result).toContain("export declare function query(model: 'blog-post'): QueryBuilder<BlogPost>")
  })

  it('generates singleton overloads', () => {
    const models: ModelDefinition[] = [{
      id: 'hero',
      name: 'Hero',
      kind: 'singleton',
      domain: 'marketing',
      i18n: true,
    }]
    const result = emitTypes(models)
    expect(result).toContain("export declare function singleton(model: 'hero'): SingletonAccessor<Hero>")
  })

  it('generates dictionary overloads', () => {
    const models: ModelDefinition[] = [{
      id: 'error-messages',
      name: 'Errors',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
    }]
    const result = emitTypes(models)
    expect(result).toContain("export declare function dictionary(model: 'error-messages'): DictionaryAccessor")
  })

  it('maps all field types correctly', () => {
    const models: ModelDefinition[] = [{
      id: 'test-all',
      name: 'Test All',
      kind: 'collection',
      domain: 'test',
      i18n: false,
      fields: {
        f_string: { type: 'string' },
        f_email: { type: 'email' },
        f_number: { type: 'number' },
        f_integer: { type: 'integer' },
        f_boolean: { type: 'boolean' },
        f_date: { type: 'date' },
        f_image: { type: 'image' },
        f_relation: { type: 'relation', model: 'author' },
        f_relations: { type: 'relations', model: 'tag' },
      },
    }]
    const result = emitTypes(models)
    expect(result).toContain('f_string?: string')
    expect(result).toContain('f_email?: string')
    expect(result).toContain('f_number?: number')
    expect(result).toContain('f_integer?: number')
    expect(result).toContain('f_boolean?: boolean')
    expect(result).toContain('f_date?: string')
    expect(result).toContain('f_image?: string')
    expect(result).toContain('f_relation?: string')
    expect(result).toContain('f_relations?: string[]')
  })
})
