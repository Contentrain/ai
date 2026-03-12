// ─── Type System ───

export type FieldType =
  | 'string' | 'text' | 'email' | 'url' | 'slug' | 'color' | 'phone' | 'code' | 'icon'
  | 'markdown' | 'richtext'
  | 'number' | 'integer' | 'decimal' | 'percent' | 'rating'
  | 'boolean'
  | 'date' | 'datetime'
  | 'image' | 'video' | 'file'
  | 'relation' | 'relations'
  | 'select' | 'array' | 'object'

export type ModelKind = 'singleton' | 'collection' | 'document' | 'dictionary'
export type ContentStatus = 'draft' | 'in_review' | 'published' | 'rejected' | 'archived'
export type ContentSource = 'agent' | 'human' | 'import'
export type WorkflowMode = 'auto-merge' | 'review'
export type StackType = 'nuxt' | 'next' | 'react-vite' | 'astro' | 'svelte' | 'other'
export type ContextSource = 'mcp-local' | 'mcp-studio' | 'studio-ui'
export type CollectionRuntimeFormat = 'map' | 'array'

// ─── Field Definition ───

export interface FieldDef {
  type: FieldType
  required?: boolean
  unique?: boolean
  default?: unknown
  min?: number
  max?: number
  pattern?: string
  options?: string[]
  model?: string | string[]
  items?: string | FieldDef
  fields?: Record<string, FieldDef>
  accept?: string
  maxSize?: number
  description?: string
}

// ─── Model Definition ───

export interface ModelDefinition {
  id: string
  name: string
  kind: ModelKind
  domain: string
  i18n: boolean
  description?: string
  fields?: Record<string, FieldDef>
}

// ─── Config ───

export interface ContentrainConfig {
  version: number
  stack: StackType
  workflow: WorkflowMode
  repository?: {
    provider: 'github'
    owner: string
    name: string
    default_branch: string
  }
  locales: {
    default: string
    supported: string[]
  }
  domains: string[]
  assets_path?: string
  branchRetention?: number
}

// ─── Vocabulary ───

export interface Vocabulary {
  version: number
  terms: Record<string, Record<string, string>>
}

// ─── Metadata ───

export interface EntryMeta {
  status: ContentStatus
  source: ContentSource
  updated_by: string
  approved_by?: string | null
  version?: string
}

export type SingletonMeta = EntryMeta
export type CollectionMeta = Record<string, EntryMeta>
export type DocumentMeta = EntryMeta
export type DictionaryMeta = EntryMeta

// ─── Asset ───

export interface AssetEntry {
  path: string
  type: string
  size: number
  alt?: string
}

// ─── Validation ───

export interface ValidationError {
  severity: 'error' | 'warning' | 'notice'
  model?: string
  locale?: string
  entry?: string
  slug?: string
  field?: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

// ─── Content Types (Storage vs Output) ───

export type SingletonContentFile = Record<string, unknown>
export type CollectionContentFile = Record<string, Record<string, unknown>>
export type DictionaryContentFile = Record<string, string>

export type CollectionEntry = { id: string } & Record<string, unknown>
export type CollectionContentOutput = CollectionEntry[]

// ─── Context ───

export interface ContextJson {
  version: string
  lastOperation: {
    tool: string
    model: string
    locale: string
    entries?: string[]
    timestamp: string
    source: ContextSource
  }
  stats: {
    models: number
    entries: number
    locales: string[]
    lastSync: string
  }
}
