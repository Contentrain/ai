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
// Meta-frameworks
export type StackType =
  | 'nuxt' | 'next' | 'astro' | 'sveltekit' | 'remix' | 'analog'
  // Plain frameworks
  | 'vue' | 'react' | 'svelte' | 'solid' | 'angular'
  // Mobile
  | 'react-native' | 'expo' | 'flutter'
  // Backend
  | 'node' | 'express' | 'fastify' | 'nestjs' | 'django' | 'rails' | 'laravel' | 'go' | 'rust' | 'dotnet'
  // Static site generators
  | 'hugo' | 'jekyll' | 'eleventy'
  // Desktop
  | 'electron' | 'tauri'
  // Catch-all
  | 'other'

export type Platform = 'web' | 'mobile' | 'api' | 'desktop' | 'static' | 'other'
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
  platform?: Platform
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
  publish_at?: string
  expire_at?: string
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

// Storage formats — how content is written to disk (canonical JSON)
export type SingletonContentFile = Record<string, unknown>
export type CollectionContentFile = Record<string, Record<string, unknown>>
export type DictionaryContentFile = Record<string, string>
// Document storage = markdown file (frontmatter + body), not JSON

// Output formats — how MCP/SDK returns content to consumers
export type CollectionEntry = { id: string } & Record<string, unknown>
export type CollectionContentOutput = CollectionEntry[]

/** Document entry as returned by MCP/SDK — parsed markdown with frontmatter */
export interface DocumentEntry {
  slug: string
  frontmatter: Record<string, unknown>
  body: string
}

export type DocumentContentOutput = DocumentEntry[]

/** Polymorphic relation storage — used when model field is string[] (multiple targets) */
export interface PolymorphicRelationRef {
  model: string
  ref: string
}

// ─── Model Summary ───

/** Lightweight model info for listing and status operations */
export interface ModelSummary {
  id: string
  kind: ModelKind
  domain: string
  i18n: boolean
  fields: number
}

// ─── File Framework ───

/** Source file framework — detected from extension for normalize/apply operations */
export type FileFramework = 'vue' | 'svelte' | 'jsx' | 'astro' | 'script'

// ─── Path Conventions ───

/** Root directory name for all Contentrain data */
export const CONTENTRAIN_DIR = '.contentrain' as const

/**
 * Default path patterns for Contentrain projects.
 * Variables: {domain}, {modelId}, {locale}, {slug}
 *
 * When a model has `content_path` set, content files are written to
 * `{projectRoot}/{content_path}/` instead — but meta files always
 * remain under `.contentrain/meta/`.
 */
export const PATH_PATTERNS = {
  config: '.contentrain/config.json',
  context: '.contentrain/context.json',
  vocabulary: '.contentrain/vocabulary.json',
  model: '.contentrain/models/{modelId}.json',
  content: {
    singleton: '.contentrain/content/{domain}/{modelId}/{locale}.json',
    collection: '.contentrain/content/{domain}/{modelId}/{locale}.json',
    document: '.contentrain/content/{domain}/{slug}/{locale}.md',
    dictionary: '.contentrain/content/{domain}/{modelId}/{locale}.json',
    /** Non-i18n content (i18n: false) */
    noLocale: '.contentrain/content/{domain}/{modelId}/data.json',
  },
  meta: {
    singleton: '.contentrain/meta/{modelId}/{locale}.json',
    collection: '.contentrain/meta/{modelId}/{locale}.json',
    document: '.contentrain/meta/{modelId}/{slug}/{locale}.json',
    dictionary: '.contentrain/meta/{modelId}/{locale}.json',
  },
} as const

// ─── Validation Patterns ───

/** Slug: lowercase alphanumeric with hyphens */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Entry ID: alphanumeric, 1-40 chars, starts with alphanumeric */
export const ENTRY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/
/** Locale: ISO 639-1 with optional region code */
export const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/

// ─── Canonical Serialization ───

/** Rules for deterministic JSON output — ensures stable git diffs */
export const CANONICAL_JSON = {
  indent: 2,
  encoding: 'utf-8',
  trailingNewline: true,
  omitNull: true,
  omitDefaults: true,
  sortKeys: true,
} as const

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
  sampling_note?: string
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

// ─── Git Transaction Types ───

/** Standard name for the dedicated content branch */
export const CONTENTRAIN_BRANCH = 'contentrain' as const

/** Result of selective file sync to developer's working tree */
export interface SyncResult {
  /** Files successfully synced to working tree */
  synced: string[]
  /** Files skipped due to uncommitted local changes */
  skipped: string[]
  /** Human-readable warning if files were skipped */
  warning?: string
}

/** Structured error for git operations with actionable guidance */
export interface ContentrainError {
  /** Machine-readable error code */
  code: string
  /** Human-readable error message */
  message: string
  /** Guidance for AI agents on how to handle this error */
  agent_hint: string
  /** Command or action the developer should take */
  developer_action: string
}
