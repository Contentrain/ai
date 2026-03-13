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

export type LocaleStrategy = 'file' | 'suffix' | 'directory' | 'none'

export interface ModelDefinition {
  id: string
  name: string
  kind: ModelKind
  domain: string
  i18n: boolean
  description?: string
  fields?: Record<string, FieldDef>
  /** Framework-relative path for content files (e.g. "content/blog", "locales"). When set, content is written here instead of .contentrain/content/ */
  content_path?: string
  /** How locale is encoded in file names. Default: "file" ({dir}/{locale}.json or {dir}/{slug}/{locale}.md) */
  locale_strategy?: LocaleStrategy
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

// ─── Scaffold ───

export interface ScaffoldTemplate {
  id: string
  models: ModelDefinition[]
  sample_content?: Record<string, Record<string, unknown>>
  vocabulary?: Record<string, Record<string, string>>
}

// ─── Scan Types ───

export type StringContext =
  | 'jsx_text' | 'jsx_attribute'
  | 'template_text' | 'template_attribute'
  | 'variable_assignment' | 'function_argument'
  | 'object_value' | 'other'

export type FileCategory = 'page' | 'component' | 'layout' | 'other'

export interface ScanCandidate {
  file: string
  line: number
  column: number
  value: string
  context: StringContext
  surrounding: string
}

export interface DuplicateGroup {
  value: string
  count: number
  occurrences: Array<{ file: string; line: number }>
}

export interface GraphNode {
  file: string
  category: FileCategory
  components?: string[]
  imports: string[]
  used_by: string[]
  strings: number
}

export interface ProjectGraph {
  pages: GraphNode[]
  components: GraphNode[]
  layouts: GraphNode[]
  orphan_files: string[]
  stats: {
    total_files: number
    total_components: number
    total_pages: number
    total_strings_estimate: number
  }
}

export interface ScanCandidatesResult {
  candidates: ScanCandidate[]
  duplicates: DuplicateGroup[]
  stats: {
    files_scanned: number
    raw_strings_found: number
    after_filtering: number
    candidates_returned: number
    has_more: boolean
  }
}

export interface ScanSummaryResult {
  total_files: number
  total_candidates_estimate: number
  by_directory: Record<string, { files: number; candidates: number }>
  top_repeated: Array<{ value: string; count: number }>
  file_types: Record<string, number>
}

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
