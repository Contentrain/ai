import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  FieldType,
  ModelKind,
  ContentStatus,
  ContentSource,
  WorkflowMode,
  StackType,
  Platform,
  ContextSource,
  CollectionRuntimeFormat,
  FieldDef,
  ModelDefinition,
  ContentrainConfig,
  Vocabulary,
  EntryMeta,
  SingletonMeta,
  CollectionMeta,
  DocumentMeta,
  DictionaryMeta,
  AssetEntry,
  ValidationError,
  ValidationResult,
  SingletonContentFile,
  CollectionContentFile,
  DictionaryContentFile,
  CollectionEntry,
  CollectionContentOutput,
  DocumentEntry,
  DocumentContentOutput,
  PolymorphicRelationRef,
  ModelSummary,
  FileFramework,
  ContextJson,
} from './index'
import {
  CONTENTRAIN_DIR,
  PATH_PATTERNS,
  SLUG_PATTERN,
  ENTRY_ID_PATTERN,
  LOCALE_PATTERN,
  CANONICAL_JSON,
  SECRET_PATTERNS,
  validateSlug,
  validateEntryId,
  validateLocale,
  detectSecrets,
  validateFieldValue,
  sortKeys,
  canonicalStringify,
  generateEntryId,
  parseMarkdownFrontmatter,
  serializeMarkdownFrontmatter,
} from './index'

describe('@contentrain/types', () => {
  describe('union types', () => {
    it('FieldType has 27 members', () => {
      expectTypeOf<'string'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'text'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'email'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'url'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'slug'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'color'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'phone'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'code'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'icon'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'markdown'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'richtext'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'number'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'integer'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'decimal'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'percent'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'rating'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'boolean'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'date'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'datetime'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'image'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'video'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'file'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'relation'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'relations'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'select'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'array'>().toMatchTypeOf<FieldType>()
      expectTypeOf<'object'>().toMatchTypeOf<FieldType>()
      // invalid type should not match
      expectTypeOf<'invalid'>().not.toMatchTypeOf<FieldType>()
    })

    it('ModelKind has 4 members', () => {
      expectTypeOf<'singleton'>().toMatchTypeOf<ModelKind>()
      expectTypeOf<'collection'>().toMatchTypeOf<ModelKind>()
      expectTypeOf<'document'>().toMatchTypeOf<ModelKind>()
      expectTypeOf<'dictionary'>().toMatchTypeOf<ModelKind>()
      expectTypeOf<'unknown'>().not.toMatchTypeOf<ModelKind>()
    })

    it('ContentStatus has 5 members', () => {
      expectTypeOf<'draft'>().toMatchTypeOf<ContentStatus>()
      expectTypeOf<'in_review'>().toMatchTypeOf<ContentStatus>()
      expectTypeOf<'published'>().toMatchTypeOf<ContentStatus>()
      expectTypeOf<'rejected'>().toMatchTypeOf<ContentStatus>()
      expectTypeOf<'archived'>().toMatchTypeOf<ContentStatus>()
    })

    it('ContentSource has 3 members', () => {
      expectTypeOf<'agent'>().toMatchTypeOf<ContentSource>()
      expectTypeOf<'human'>().toMatchTypeOf<ContentSource>()
      expectTypeOf<'import'>().toMatchTypeOf<ContentSource>()
    })

    it('WorkflowMode has 2 members', () => {
      expectTypeOf<'auto-merge'>().toMatchTypeOf<WorkflowMode>()
      expectTypeOf<'review'>().toMatchTypeOf<WorkflowMode>()
    })

    it('StackType covers all platform categories', () => {
      // Meta-frameworks
      expectTypeOf<'nuxt'>().toMatchTypeOf<StackType>()
      expectTypeOf<'next'>().toMatchTypeOf<StackType>()
      expectTypeOf<'astro'>().toMatchTypeOf<StackType>()
      expectTypeOf<'sveltekit'>().toMatchTypeOf<StackType>()
      expectTypeOf<'remix'>().toMatchTypeOf<StackType>()
      expectTypeOf<'analog'>().toMatchTypeOf<StackType>()
      // Plain frameworks
      expectTypeOf<'vue'>().toMatchTypeOf<StackType>()
      expectTypeOf<'react'>().toMatchTypeOf<StackType>()
      expectTypeOf<'svelte'>().toMatchTypeOf<StackType>()
      expectTypeOf<'solid'>().toMatchTypeOf<StackType>()
      expectTypeOf<'angular'>().toMatchTypeOf<StackType>()
      // Mobile
      expectTypeOf<'react-native'>().toMatchTypeOf<StackType>()
      expectTypeOf<'expo'>().toMatchTypeOf<StackType>()
      expectTypeOf<'flutter'>().toMatchTypeOf<StackType>()
      // Backend
      expectTypeOf<'node'>().toMatchTypeOf<StackType>()
      expectTypeOf<'django'>().toMatchTypeOf<StackType>()
      expectTypeOf<'rails'>().toMatchTypeOf<StackType>()
      expectTypeOf<'go'>().toMatchTypeOf<StackType>()
      expectTypeOf<'rust'>().toMatchTypeOf<StackType>()
      expectTypeOf<'dotnet'>().toMatchTypeOf<StackType>()
      // Static + Desktop
      expectTypeOf<'hugo'>().toMatchTypeOf<StackType>()
      expectTypeOf<'electron'>().toMatchTypeOf<StackType>()
      expectTypeOf<'tauri'>().toMatchTypeOf<StackType>()
      // Catch-all
      expectTypeOf<'other'>().toMatchTypeOf<StackType>()
    })

    it('Platform has 6 members', () => {
      expectTypeOf<'web'>().toMatchTypeOf<Platform>()
      expectTypeOf<'mobile'>().toMatchTypeOf<Platform>()
      expectTypeOf<'api'>().toMatchTypeOf<Platform>()
      expectTypeOf<'desktop'>().toMatchTypeOf<Platform>()
      expectTypeOf<'static'>().toMatchTypeOf<Platform>()
      expectTypeOf<'other'>().toMatchTypeOf<Platform>()
    })

    it('ContextSource has 3 members', () => {
      expectTypeOf<'mcp-local'>().toMatchTypeOf<ContextSource>()
      expectTypeOf<'mcp-studio'>().toMatchTypeOf<ContextSource>()
      expectTypeOf<'studio-ui'>().toMatchTypeOf<ContextSource>()
    })

    it('CollectionRuntimeFormat has 2 members', () => {
      expectTypeOf<'map'>().toMatchTypeOf<CollectionRuntimeFormat>()
      expectTypeOf<'array'>().toMatchTypeOf<CollectionRuntimeFormat>()
    })
  })

  describe('FieldDef', () => {
    it('requires type property', () => {
      expectTypeOf<FieldDef>().toHaveProperty('type')
      expectTypeOf<FieldDef['type']>().toEqualTypeOf<FieldType>()
    })

    it('has optional constraints', () => {
      expectTypeOf<FieldDef>().toHaveProperty('required')
      expectTypeOf<FieldDef>().toHaveProperty('unique')
      expectTypeOf<FieldDef>().toHaveProperty('min')
      expectTypeOf<FieldDef>().toHaveProperty('max')
      expectTypeOf<FieldDef>().toHaveProperty('pattern')
      expectTypeOf<FieldDef>().toHaveProperty('description')
    })

    it('supports relation model (string | string[])', () => {
      expectTypeOf<string>().toMatchTypeOf<NonNullable<FieldDef['model']>>()
      expectTypeOf<string[]>().toMatchTypeOf<NonNullable<FieldDef['model']>>()
    })

    it('supports recursive fields for object type', () => {
      expectTypeOf<Record<string, FieldDef>>().toMatchTypeOf<NonNullable<FieldDef['fields']>>()
    })

    it('supports items as string or FieldDef for array type', () => {
      expectTypeOf<string>().toMatchTypeOf<NonNullable<FieldDef['items']>>()
      expectTypeOf<FieldDef>().toMatchTypeOf<NonNullable<FieldDef['items']>>()
    })

    it('supports media properties', () => {
      expectTypeOf<FieldDef>().toHaveProperty('accept')
      expectTypeOf<FieldDef>().toHaveProperty('maxSize')
    })
  })

  describe('ModelDefinition', () => {
    it('has required properties', () => {
      expectTypeOf<ModelDefinition>().toHaveProperty('id')
      expectTypeOf<ModelDefinition>().toHaveProperty('name')
      expectTypeOf<ModelDefinition>().toHaveProperty('kind')
      expectTypeOf<ModelDefinition>().toHaveProperty('domain')
      expectTypeOf<ModelDefinition>().toHaveProperty('i18n')
    })

    it('kind is ModelKind', () => {
      expectTypeOf<ModelDefinition['kind']>().toEqualTypeOf<ModelKind>()
    })

    it('fields is optional Record<string, FieldDef>', () => {
      expectTypeOf<Record<string, FieldDef>>().toMatchTypeOf<NonNullable<ModelDefinition['fields']>>()
    })
  })

  describe('ContentrainConfig', () => {
    it('stack is StackType (strict)', () => {
      expectTypeOf<ContentrainConfig['stack']>().toEqualTypeOf<StackType>()
    })

    it('workflow is WorkflowMode (strict)', () => {
      expectTypeOf<ContentrainConfig['workflow']>().toEqualTypeOf<WorkflowMode>()
    })

    it('has locales with default and supported', () => {
      expectTypeOf<ContentrainConfig['locales']>().toHaveProperty('default')
      expectTypeOf<ContentrainConfig['locales']>().toHaveProperty('supported')
    })

    it('repository is optional', () => {
      const config: ContentrainConfig = {
        version: 1,
        stack: 'nuxt',
        workflow: 'review',
        locales: { default: 'en', supported: ['en'] },
        domains: ['ui'],
      }
      expectTypeOf(config).toMatchTypeOf<ContentrainConfig>()
    })
  })

  describe('Metadata types', () => {
    it('EntryMeta has status and source', () => {
      expectTypeOf<EntryMeta['status']>().toEqualTypeOf<ContentStatus>()
      expectTypeOf<EntryMeta['source']>().toEqualTypeOf<ContentSource>()
    })

    it('SingletonMeta equals EntryMeta', () => {
      expectTypeOf<SingletonMeta>().toEqualTypeOf<EntryMeta>()
    })

    it('CollectionMeta is Record<string, EntryMeta>', () => {
      expectTypeOf<CollectionMeta>().toEqualTypeOf<Record<string, EntryMeta>>()
    })

    it('DocumentMeta equals EntryMeta', () => {
      expectTypeOf<DocumentMeta>().toEqualTypeOf<EntryMeta>()
    })

    it('DictionaryMeta equals EntryMeta', () => {
      expectTypeOf<DictionaryMeta>().toEqualTypeOf<EntryMeta>()
    })
  })

  describe('Validation types', () => {
    it('ValidationError has severity and message', () => {
      expectTypeOf<ValidationError['severity']>().toEqualTypeOf<'error' | 'warning' | 'notice'>()
      expectTypeOf<ValidationError['message']>().toEqualTypeOf<string>()
    })

    it('ValidationResult has valid and errors', () => {
      expectTypeOf<ValidationResult['valid']>().toEqualTypeOf<boolean>()
      expectTypeOf<ValidationResult['errors']>().toEqualTypeOf<ValidationError[]>()
    })
  })

  describe('Content storage types', () => {
    it('SingletonContentFile is Record<string, unknown>', () => {
      expectTypeOf<SingletonContentFile>().toEqualTypeOf<Record<string, unknown>>()
    })

    it('CollectionContentFile is nested Record', () => {
      expectTypeOf<CollectionContentFile>().toEqualTypeOf<Record<string, Record<string, unknown>>>()
    })

    it('DictionaryContentFile is Record<string, string>', () => {
      expectTypeOf<DictionaryContentFile>().toEqualTypeOf<Record<string, string>>()
    })

    it('CollectionEntry has id + dynamic fields', () => {
      expectTypeOf<CollectionEntry>().toHaveProperty('id')
      expectTypeOf<CollectionEntry['id']>().toEqualTypeOf<string>()
    })

    it('CollectionContentOutput is array of CollectionEntry', () => {
      expectTypeOf<CollectionContentOutput>().toEqualTypeOf<CollectionEntry[]>()
    })
  })

  describe('ContextJson', () => {
    it('has version, lastOperation, stats', () => {
      expectTypeOf<ContextJson>().toHaveProperty('version')
      expectTypeOf<ContextJson>().toHaveProperty('lastOperation')
      expectTypeOf<ContextJson>().toHaveProperty('stats')
    })

    it('lastOperation.source is ContextSource', () => {
      expectTypeOf<ContextJson['lastOperation']['source']>().toEqualTypeOf<ContextSource>()
    })

    it('stats.locales is string[]', () => {
      expectTypeOf<ContextJson['stats']['locales']>().toEqualTypeOf<string[]>()
    })
  })

  describe('Vocabulary', () => {
    it('terms is nested Record<string, Record<string, string>>', () => {
      expectTypeOf<Vocabulary['terms']>().toEqualTypeOf<Record<string, Record<string, string>>>()
    })
  })

  describe('AssetEntry', () => {
    it('has required path, type, size', () => {
      expectTypeOf<AssetEntry>().toHaveProperty('path')
      expectTypeOf<AssetEntry>().toHaveProperty('type')
      expectTypeOf<AssetEntry>().toHaveProperty('size')
    })

    it('alt is optional', () => {
      const asset: AssetEntry = { path: 'a.png', type: 'image/png', size: 100 }
      expectTypeOf(asset).toMatchTypeOf<AssetEntry>()
    })
  })

  describe('DocumentEntry', () => {
    it('has slug, frontmatter, body', () => {
      expectTypeOf<DocumentEntry>().toHaveProperty('slug')
      expectTypeOf<DocumentEntry>().toHaveProperty('frontmatter')
      expectTypeOf<DocumentEntry>().toHaveProperty('body')
      expectTypeOf<DocumentEntry['slug']>().toEqualTypeOf<string>()
      expectTypeOf<DocumentEntry['frontmatter']>().toEqualTypeOf<Record<string, unknown>>()
      expectTypeOf<DocumentEntry['body']>().toEqualTypeOf<string>()
    })

    it('DocumentContentOutput is array of DocumentEntry', () => {
      expectTypeOf<DocumentContentOutput>().toEqualTypeOf<DocumentEntry[]>()
    })
  })

  describe('PolymorphicRelationRef', () => {
    it('has model and ref', () => {
      expectTypeOf<PolymorphicRelationRef>().toHaveProperty('model')
      expectTypeOf<PolymorphicRelationRef>().toHaveProperty('ref')
      expectTypeOf<PolymorphicRelationRef['model']>().toEqualTypeOf<string>()
      expectTypeOf<PolymorphicRelationRef['ref']>().toEqualTypeOf<string>()
    })
  })

  describe('ModelSummary', () => {
    it('has id, kind, domain, i18n, fields', () => {
      expectTypeOf<ModelSummary>().toHaveProperty('id')
      expectTypeOf<ModelSummary['kind']>().toEqualTypeOf<ModelKind>()
      expectTypeOf<ModelSummary['fields']>().toEqualTypeOf<number>()
    })
  })

  describe('FileFramework', () => {
    it('has 5 members', () => {
      expectTypeOf<'vue'>().toMatchTypeOf<FileFramework>()
      expectTypeOf<'svelte'>().toMatchTypeOf<FileFramework>()
      expectTypeOf<'jsx'>().toMatchTypeOf<FileFramework>()
      expectTypeOf<'astro'>().toMatchTypeOf<FileFramework>()
      expectTypeOf<'script'>().toMatchTypeOf<FileFramework>()
      expectTypeOf<'python'>().not.toMatchTypeOf<FileFramework>()
    })
  })

  describe('constants', () => {
    it('CONTENTRAIN_DIR is .contentrain', () => {
      expect(CONTENTRAIN_DIR).toBe('.contentrain')
    })

    it('PATH_PATTERNS has all kind paths', () => {
      expect(PATH_PATTERNS.config).toContain('.contentrain')
      expect(PATH_PATTERNS.content.singleton).toContain('{locale}')
      expect(PATH_PATTERNS.content.collection).toContain('{locale}')
      expect(PATH_PATTERNS.content.document).toContain('{slug}')
      expect(PATH_PATTERNS.content.document).toContain('.md')
      expect(PATH_PATTERNS.content.dictionary).toContain('{locale}')
      expect(PATH_PATTERNS.content.noLocale).toContain('data.json')
      expect(PATH_PATTERNS.meta.document).toContain('{slug}')
    })

    it('validation patterns match expected formats', () => {
      expect(SLUG_PATTERN.test('hello-world')).toBe(true)
      expect(SLUG_PATTERN.test('Hello')).toBe(false)
      expect(ENTRY_ID_PATTERN.test('a1b2c3d4e5f6')).toBe(true)
      expect(ENTRY_ID_PATTERN.test('')).toBe(false)
      expect(LOCALE_PATTERN.test('en')).toBe(true)
      expect(LOCALE_PATTERN.test('en-US')).toBe(true)
      expect(LOCALE_PATTERN.test('english')).toBe(false)
    })

    it('CANONICAL_JSON has serialization rules', () => {
      expect(CANONICAL_JSON.indent).toBe(2)
      expect(CANONICAL_JSON.trailingNewline).toBe(true)
      expect(CANONICAL_JSON.sortKeys).toBe(true)
    })

    it('SECRET_PATTERNS is a non-empty array of RegExp', () => {
      expect(SECRET_PATTERNS.length).toBeGreaterThan(0)
      for (const p of SECRET_PATTERNS) {
        expect(p).toBeInstanceOf(RegExp)
      }
    })
  })

  // ─── Validate functions ───

  describe('validateSlug', () => {
    it('accepts valid kebab-case slugs', () => {
      expect(validateSlug('hello-world')).toBeNull()
      expect(validateSlug('my-post')).toBeNull()
      expect(validateSlug('a')).toBeNull()
      expect(validateSlug('abc123')).toBeNull()
    })

    it('rejects empty slugs', () => {
      expect(validateSlug('')).toBe('Slug is required')
    })

    it('rejects uppercase slugs', () => {
      expect(validateSlug('Hello')).toContain('kebab-case')
    })

    it('rejects path traversal attempts (caught by pattern)', () => {
      expect(validateSlug('..evil')).toContain('kebab-case')
      expect(validateSlug('.hidden')).toContain('kebab-case')
    })

    it('rejects slugs with special characters', () => {
      expect(validateSlug('hello_world')).toContain('kebab-case')
      expect(validateSlug('hello world')).toContain('kebab-case')
    })
  })

  describe('validateEntryId', () => {
    it('accepts valid entry IDs', () => {
      expect(validateEntryId('a1b2c3d4e5f6')).toBeNull()
      expect(validateEntryId('abc')).toBeNull()
      expect(validateEntryId('A1-B2_C3')).toBeNull()
    })

    it('rejects empty IDs', () => {
      expect(validateEntryId('')).toContain('Invalid entry ID')
    })

    it('rejects IDs starting with special chars', () => {
      expect(validateEntryId('-abc')).toContain('Invalid entry ID')
      expect(validateEntryId('_abc')).toContain('Invalid entry ID')
    })

    it('rejects IDs longer than 40 chars', () => {
      expect(validateEntryId('a'.repeat(41))).toContain('Invalid entry ID')
    })
  })

  describe('validateLocale', () => {
    const config: ContentrainConfig = {
      version: 1,
      stack: 'nuxt',
      workflow: 'review',
      locales: { default: 'en', supported: ['en', 'tr', 'pt-BR'] },
      domains: ['ui'],
    }

    it('accepts valid supported locales', () => {
      expect(validateLocale('en', config)).toBeNull()
      expect(validateLocale('tr', config)).toBeNull()
      expect(validateLocale('pt-BR', config)).toBeNull()
    })

    it('rejects invalid format', () => {
      expect(validateLocale('english', config)).toContain('ISO 639-1')
    })

    it('rejects unsupported locale', () => {
      expect(validateLocale('fr', config)).toContain('not in supported locales')
    })
  })

  describe('detectSecrets', () => {
    it('detects API keys', () => {
      expect(detectSecrets('sk_live_abc123')).toHaveLength(1)
      expect(detectSecrets('my_api_key_value')).toHaveLength(1)
    })

    it('detects GitHub tokens', () => {
      expect(detectSecrets('ghp_abcdef123456')).toHaveLength(1)
    })

    it('detects database URLs', () => {
      expect(detectSecrets('postgres://user:pass@host/db')).toHaveLength(1)
      expect(detectSecrets('mongodb://localhost/test')).toHaveLength(1)
    })

    it('detects AWS credentials', () => {
      expect(detectSecrets('AKIAIOSFODNN7EXAMPLE')).toHaveLength(1)
    })

    it('returns empty for safe values', () => {
      expect(detectSecrets('Hello world')).toHaveLength(0)
      expect(detectSecrets('just a normal string')).toHaveLength(0)
    })

    it('returns empty for non-string values', () => {
      expect(detectSecrets(42)).toHaveLength(0)
      expect(detectSecrets(null)).toHaveLength(0)
      expect(detectSecrets(undefined)).toHaveLength(0)
    })
  })

  describe('validateFieldValue', () => {
    it('checks required fields', () => {
      const errors = validateFieldValue(undefined, { type: 'string', required: true })
      expect(errors).toHaveLength(1)
      expect(errors[0]!.message).toContain('Required')
    })

    it('allows missing optional fields', () => {
      expect(validateFieldValue(undefined, { type: 'string' })).toHaveLength(0)
      expect(validateFieldValue(null, { type: 'string' })).toHaveLength(0)
    })

    it('checks string types', () => {
      expect(validateFieldValue('hello', { type: 'string' })).toHaveLength(0)
      expect(validateFieldValue(42, { type: 'string' })).toHaveLength(1)
    })

    it('checks number types', () => {
      expect(validateFieldValue(42, { type: 'number' })).toHaveLength(0)
      expect(validateFieldValue('42', { type: 'number' })).toHaveLength(1)
    })

    it('checks boolean type', () => {
      expect(validateFieldValue(true, { type: 'boolean' })).toHaveLength(0)
      expect(validateFieldValue('true', { type: 'boolean' })).toHaveLength(1)
    })

    it('checks array types', () => {
      expect(validateFieldValue(['a', 'b'], { type: 'array' })).toHaveLength(0)
      expect(validateFieldValue('not-array', { type: 'array' })).toHaveLength(1)
    })

    it('checks object type', () => {
      expect(validateFieldValue({ a: 1 }, { type: 'object' })).toHaveLength(0)
      expect(validateFieldValue([1], { type: 'object' })).toHaveLength(1)
    })

    it('checks relation type', () => {
      expect(validateFieldValue('entry-id', { type: 'relation', model: 'posts' })).toHaveLength(0)
      expect(validateFieldValue(42, { type: 'relation', model: 'posts' })).toHaveLength(1)
    })

    it('checks min/max for numbers', () => {
      expect(validateFieldValue(5, { type: 'number', min: 1, max: 10 })).toHaveLength(0)
      expect(validateFieldValue(0, { type: 'number', min: 1 })).toHaveLength(1)
      expect(validateFieldValue(11, { type: 'number', max: 10 })).toHaveLength(1)
    })

    it('checks min/max for string length', () => {
      expect(validateFieldValue('abc', { type: 'string', min: 2, max: 5 })).toHaveLength(0)
      expect(validateFieldValue('a', { type: 'string', min: 2 })).toHaveLength(1)
      expect(validateFieldValue('abcdef', { type: 'string', max: 5 })).toHaveLength(1)
    })

    it('checks min/max for array length', () => {
      expect(validateFieldValue([1, 2], { type: 'array', min: 1, max: 3 })).toHaveLength(0)
      expect(validateFieldValue([], { type: 'array', min: 1 })).toHaveLength(1)
    })

    it('checks pattern regex', () => {
      expect(validateFieldValue('abc', { type: 'string', pattern: '^[a-z]+$' })).toHaveLength(0)
      expect(validateFieldValue('ABC', { type: 'string', pattern: '^[a-z]+$' })).toHaveLength(1)
    })

    it('warns on invalid pattern regex', () => {
      const errors = validateFieldValue('abc', { type: 'string', pattern: '[invalid' })
      expect(errors).toHaveLength(1)
      expect(errors[0]!.severity).toBe('warning')
    })

    it('checks select options', () => {
      expect(validateFieldValue('a', { type: 'select', options: ['a', 'b', 'c'] })).toHaveLength(0)
      expect(validateFieldValue('d', { type: 'select', options: ['a', 'b', 'c'] })).toHaveLength(1)
    })

    it('returns early on type mismatch (skip further checks)', () => {
      const errors = validateFieldValue(42, { type: 'string', min: 1, pattern: '^[a-z]+$' })
      expect(errors).toHaveLength(1)
      expect(errors[0]!.message).toContain('Type mismatch')
    })
  })

  // ─── Serialize functions ───

  describe('sortKeys', () => {
    it('sorts object keys lexicographically', () => {
      const result = sortKeys({ z: 1, a: 2, m: 3 }) as Record<string, number>
      expect(Object.keys(result)).toEqual(['a', 'm', 'z'])
    })

    it('omits null and undefined', () => {
      const result = sortKeys({ a: 1, b: null, c: undefined }) as Record<string, unknown>
      expect(Object.keys(result)).toEqual(['a'])
    })

    it('sorts nested objects recursively', () => {
      const result = sortKeys({ b: { z: 1, a: 2 }, a: 3 }) as Record<string, unknown>
      expect(Object.keys(result)).toEqual(['a', 'b'])
      expect(Object.keys(result['b'] as object)).toEqual(['a', 'z'])
    })

    it('preserves array order', () => {
      const result = sortKeys({ items: [3, 1, 2] }) as Record<string, number[]>
      expect(result['items']).toEqual([3, 1, 2])
    })

    it('respects fieldOrder', () => {
      const result = sortKeys({ z: 1, a: 2, m: 3 }, ['m', 'z', 'a']) as Record<string, number>
      expect(Object.keys(result)).toEqual(['m', 'z', 'a'])
    })

    it('returns undefined for null/undefined input', () => {
      expect(sortKeys(null)).toBeUndefined()
      expect(sortKeys(undefined)).toBeUndefined()
    })

    it('returns primitives as-is', () => {
      expect(sortKeys(42)).toBe(42)
      expect(sortKeys('hello')).toBe('hello')
      expect(sortKeys(true)).toBe(true)
    })
  })

  describe('canonicalStringify', () => {
    it('produces sorted JSON with trailing newline', () => {
      const result = canonicalStringify({ z: 1, a: 2 })
      expect(result).toBe('{\n  "a": 2,\n  "z": 1\n}\n')
    })

    it('uses 2-space indent', () => {
      const result = canonicalStringify({ a: { b: 1 } })
      expect(result).toContain('  "a"')
      expect(result).toContain('    "b"')
    })

    it('omits null and undefined', () => {
      const result = canonicalStringify({ a: 1, b: null, c: undefined })
      expect(result).not.toContain('"b"')
      expect(result).not.toContain('"c"')
    })

    it('respects fieldOrder', () => {
      const result = canonicalStringify({ z: 1, a: 2, m: 3 }, ['m', 'z', 'a'])
      const keys = [...result.matchAll(/"([a-z])"/g)].map(m => m[1])
      expect(keys).toEqual(['m', 'z', 'a'])
    })
  })

  describe('generateEntryId', () => {
    it('returns a 12-character hex string', () => {
      const id = generateEntryId()
      expect(id).toHaveLength(12)
      expect(/^[0-9a-f]{12}$/.test(id)).toBe(true)
    })

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateEntryId()))
      expect(ids.size).toBe(100)
    })
  })

  // ─── Markdown frontmatter ───

  describe('parseMarkdownFrontmatter', () => {
    it('parses frontmatter and body', () => {
      const md = '---\ntitle: Hello\nauthor: World\n---\nBody content'
      const { frontmatter, body } = parseMarkdownFrontmatter(md)
      expect(frontmatter['title']).toBe('Hello')
      expect(frontmatter['author']).toBe('World')
      expect(body).toBe('Body content')
    })

    it('parses array values', () => {
      const md = '---\ntags:\n  - vue\n  - react\n---\nBody'
      const { frontmatter } = parseMarkdownFrontmatter(md)
      expect(frontmatter['tags']).toEqual(['vue', 'react'])
    })

    it('parses inline arrays', () => {
      const md = '---\ntags: [vue, react]\n---\nBody'
      const { frontmatter } = parseMarkdownFrontmatter(md)
      expect(frontmatter['tags']).toEqual(['vue', 'react'])
    })

    it('parses boolean and number values', () => {
      const md = '---\npublished: true\ncount: 42\nprice: 9.99\n---\n'
      const { frontmatter } = parseMarkdownFrontmatter(md)
      expect(frontmatter['published']).toBe(true)
      expect(frontmatter['count']).toBe(42)
      expect(frontmatter['price']).toBe(9.99)
    })

    it('returns empty frontmatter for content without frontmatter', () => {
      const { frontmatter, body } = parseMarkdownFrontmatter('Just a paragraph')
      expect(frontmatter).toEqual({})
      expect(body).toBe('Just a paragraph')
    })

    it('handles CRLF line endings', () => {
      const md = '---\r\ntitle: Hello\r\n---\r\nBody'
      const { frontmatter, body } = parseMarkdownFrontmatter(md)
      expect(frontmatter['title']).toBe('Hello')
      expect(body).toBe('Body')
    })

    it('handles quoted strings', () => {
      const md = '---\ntitle: "Hello: World"\n---\n'
      const { frontmatter } = parseMarkdownFrontmatter(md)
      expect(frontmatter['title']).toBe('Hello: World')
    })
  })

  describe('serializeMarkdownFrontmatter', () => {
    it('creates frontmatter with body', () => {
      const result = serializeMarkdownFrontmatter({ title: 'Hello' }, 'Body content')
      expect(result).toContain('---')
      expect(result).toContain('title: Hello')
      expect(result).toContain('Body content')
    })

    it('handles empty body', () => {
      const result = serializeMarkdownFrontmatter({ title: 'Hello' }, '')
      expect(result).toContain('---')
      expect(result).toContain('title: Hello')
    })

    it('serializes array fields', () => {
      const result = serializeMarkdownFrontmatter({ tags: ['vue', 'react'] }, '')
      expect(result).toContain('tags:')
      expect(result).toContain('  - vue')
      expect(result).toContain('  - react')
    })

    it('quotes YAML-special characters', () => {
      const result = serializeMarkdownFrontmatter({ title: 'Hello: World' }, '')
      expect(result).toContain('"Hello: World"')
    })

    it('skips body key in frontmatter', () => {
      const result = serializeMarkdownFrontmatter({ title: 'Hello', body: 'ignored' }, 'Real body')
      expect(result).not.toContain('body: ignored')
      expect(result).toContain('Real body')
    })

    it('merges model fields into existing frontmatter body', () => {
      const existingBody = '---\nextra: keep-me\n---\nOriginal content'
      const result = serializeMarkdownFrontmatter({ title: 'New' }, existingBody)
      expect(result).toContain('title: New')
      expect(result).toContain('extra: keep-me')
      expect(result).toContain('Original content')
    })

    it('roundtrips with parseMarkdownFrontmatter', () => {
      const data = { title: 'Hello', slug: 'hello-world' }
      const body = 'Some markdown content'
      const serialized = serializeMarkdownFrontmatter(data, body)
      const parsed = parseMarkdownFrontmatter(serialized)
      expect(parsed.frontmatter['title']).toBe('Hello')
      expect(parsed.frontmatter['slug']).toBe('hello-world')
      expect(parsed.body).toBe('Some markdown content')
    })
  })
})
