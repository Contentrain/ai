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

  it('includes relation resolution API on SingletonAccessor', () => {
    const result = emitTypes([])
    expect(result).toContain('include(...fields: string[]): SingletonAccessor<T>')
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

  it('generates include() in QueryBuilder and DocumentQuery interfaces', () => {
    const result = emitTypes([])
    expect(result).toContain('include(...fields: string[]): QueryBuilder<T>')
    expect(result).toContain('include(...fields: string[]): DocumentQuery<T>')
  })

  it('generates fallback string overload for query', () => {
    const models: ModelDefinition[] = [{
      id: 'blog-post',
      name: 'Blog Post',
      kind: 'collection',
      domain: 'blog',
      i18n: true,
    }]
    const result = emitTypes(models)
    expect(result).toContain("export declare function query(model: 'blog-post'): QueryBuilder<BlogPost>")
    expect(result).toContain('export declare function query(model: string): QueryBuilder<Record<string, unknown>>')
  })

  it('generates fallback string overload for singleton', () => {
    const models: ModelDefinition[] = [{
      id: 'hero',
      name: 'Hero',
      kind: 'singleton',
      domain: 'marketing',
      i18n: true,
    }]
    const result = emitTypes(models)
    expect(result).toContain("export declare function singleton(model: 'hero'): SingletonAccessor<Hero>")
    expect(result).toContain('export declare function singleton(model: string): SingletonAccessor<Record<string, unknown>>')
  })

  it('generates fallback string overload for dictionary', () => {
    const models: ModelDefinition[] = [{
      id: 'error-messages',
      name: 'Errors',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
    }]
    const result = emitTypes(models)
    expect(result).toContain("export declare function dictionary(model: 'error-messages'): DictionaryAccessor")
    expect(result).toContain('export declare function dictionary(model: string): DictionaryAccessor')
  })

  it('generates fallback string overload for document', () => {
    const models: ModelDefinition[] = [{
      id: 'blog-article',
      name: 'Blog Article',
      kind: 'document',
      domain: 'blog',
      i18n: true,
    }]
    const result = emitTypes(models)
    expect(result).toContain("export declare function document(model: 'blog-article'): DocumentQuery<BlogArticle>")
    expect(result).toContain('export declare function document(model: string): DocumentQuery<Record<string, unknown>>')
  })

  it('generates overloads for all model kinds together', () => {
    const models: ModelDefinition[] = [
      { id: 'blog-post', name: 'Blog Post', kind: 'collection', domain: 'blog', i18n: true },
      { id: 'author', name: 'Author', kind: 'collection', domain: 'blog', i18n: false },
      { id: 'hero-section', name: 'Hero Section', kind: 'singleton', domain: 'marketing', i18n: true },
      { id: 'ui-texts', name: 'UI Texts', kind: 'dictionary', domain: 'system', i18n: true },
      { id: 'blog-article', name: 'Blog Article', kind: 'document', domain: 'blog', i18n: true },
    ]
    const result = emitTypes(models)
    // Collection overloads
    expect(result).toContain("export declare function query(model: 'blog-post'): QueryBuilder<BlogPost>")
    expect(result).toContain("export declare function query(model: 'author'): QueryBuilder<Author>")
    expect(result).toContain('export declare function query(model: string): QueryBuilder<Record<string, unknown>>')
    // Singleton overloads
    expect(result).toContain("export declare function singleton(model: 'hero-section'): SingletonAccessor<HeroSection>")
    expect(result).toContain('export declare function singleton(model: string): SingletonAccessor<Record<string, unknown>>')
    // Dictionary overloads
    expect(result).toContain("export declare function dictionary(model: 'ui-texts'): DictionaryAccessor")
    expect(result).toContain('export declare function dictionary(model: string): DictionaryAccessor')
    // Document overloads
    expect(result).toContain("export declare function document(model: 'blog-article'): DocumentQuery<BlogArticle>")
    expect(result).toContain('export declare function document(model: string): DocumentQuery<Record<string, unknown>>')
  })

  it('generates ContentrainClient interface with typed overloads', () => {
    const models: ModelDefinition[] = [
      { id: 'blog-post', name: 'Blog Post', kind: 'collection', domain: 'blog', i18n: true },
      { id: 'hero', name: 'Hero', kind: 'singleton', domain: 'marketing', i18n: true },
      { id: 'translations', name: 'Translations', kind: 'dictionary', domain: 'system', i18n: true },
      { id: 'blog-article', name: 'Blog Article', kind: 'document', domain: 'blog', i18n: true },
    ]
    const result = emitTypes(models)
    expect(result).toContain('export interface ContentrainClient {')
    expect(result).toContain("  query(model: 'blog-post'): QueryBuilder<BlogPost>")
    expect(result).toContain('  query(model: string): QueryBuilder<Record<string, unknown>>')
    expect(result).toContain("  singleton(model: 'hero'): SingletonAccessor<Hero>")
    expect(result).toContain('  singleton(model: string): SingletonAccessor<Record<string, unknown>>')
    expect(result).toContain("  dictionary(model: 'translations'): DictionaryAccessor")
    expect(result).toContain('  dictionary(model: string): DictionaryAccessor')
    expect(result).toContain("  document(model: 'blog-article'): DocumentQuery<BlogArticle>")
    expect(result).toContain('  document(model: string): DocumentQuery<Record<string, unknown>>')
    expect(result).toContain('export declare function createContentrainClient(): ContentrainClient')
  })

  it('generates createContentrainClient even with no models', () => {
    const result = emitTypes([])
    expect(result).toContain('export interface ContentrainClient {')
    expect(result).toContain('export declare function createContentrainClient(): ContentrainClient')
    // Fallback overloads still present
    expect(result).toContain('export declare function query(model: string): QueryBuilder<Record<string, unknown>>')
    expect(result).toContain('export declare function singleton(model: string): SingletonAccessor<Record<string, unknown>>')
    expect(result).toContain('export declare function dictionary(model: string): DictionaryAccessor')
    expect(result).toContain('export declare function document(model: string): DocumentQuery<Record<string, unknown>>')
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

  it('emits object shape for polymorphic relation fields', () => {
    const models: ModelDefinition[] = [{
      id: 'featured',
      name: 'Featured',
      kind: 'collection',
      domain: 'home',
      i18n: true,
      fields: {
        target: { type: 'relation', model: ['blog-post', 'page'] },
      },
    }]
    const result = emitTypes(models)
    expect(result).toContain("target?: { model: 'blog-post' | 'page'; ref: string }")
  })
})
