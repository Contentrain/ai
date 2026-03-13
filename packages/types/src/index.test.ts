import { describe, it, expectTypeOf } from 'vitest'
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
  ContextJson,
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
})
