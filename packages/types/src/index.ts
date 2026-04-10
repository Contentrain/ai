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

// ─── Validate: Pure Functions ───

/** Common patterns for detecting potential secrets in content values */
export const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /sk_/, /pk_/, /api_key/i, /apikey/i,
  /ghp_/, /gho_/, /Bearer /,
  /postgres:\/\//, /mysql:\/\//, /mongodb:\/\//,
  /-----BEGIN/, /AKIA/, /aws_secret/i,
]

/** Validate a slug — returns error message or null if valid */
export function validateSlug(slug: string): string | null {
  if (!slug) return 'Slug is required'
  if (!SLUG_PATTERN.test(slug)) return `Invalid slug "${slug}": must be kebab-case alphanumeric (a-z, 0-9, hyphens)`
  if (slug.startsWith('.') || slug.includes('..')) return `Invalid slug "${slug}": path traversal not allowed`
  return null
}

/** Validate an entry ID — returns error message or null if valid */
export function validateEntryId(id: string): string | null {
  if (!ENTRY_ID_PATTERN.test(id)) return `Invalid entry ID "${id}": must be 1-40 alphanumeric characters (hyphens and underscores allowed)`
  return null
}

/** Validate a locale code against pattern and config — returns error message or null if valid */
export function validateLocale(locale: string, config: ContentrainConfig): string | null {
  if (!LOCALE_PATTERN.test(locale)) return `Invalid locale "${locale}": must be ISO 639-1 format (e.g. "en", "tr", "pt-BR")`
  if (!config.locales.supported.includes(locale)) {
    return `Locale "${locale}" is not in supported locales [${config.locales.supported.join(', ')}]. Update config first.`
  }
  return null
}

/** Detect potential secrets in a value — returns validation errors if found */
export function detectSecrets(value: unknown): ValidationError[] {
  if (typeof value !== 'string') return []
  if (SECRET_PATTERNS.some(p => p.test(value))) {
    return [{ severity: 'error', message: 'Potential secret detected in value' }]
  }
  return []
}

function fieldTypeMatches(value: unknown, fieldDef: FieldDef): boolean {
  if (value === null || value === undefined) return true

  switch (fieldDef.type) {
    case 'string':
    case 'text':
    case 'email':
    case 'url':
    case 'slug':
    case 'color':
    case 'phone':
    case 'code':
    case 'icon':
    case 'markdown':
    case 'richtext':
    case 'date':
    case 'datetime':
    case 'image':
    case 'video':
    case 'file':
    case 'select':
      return typeof value === 'string'

    case 'number':
    case 'integer':
    case 'decimal':
    case 'percent':
    case 'rating':
      return typeof value === 'number'

    case 'boolean':
      return typeof value === 'boolean'

    case 'relation':
      return typeof value === 'string'

    case 'relations':
    case 'array':
      return Array.isArray(value)

    case 'object':
      return typeof value === 'object' && !Array.isArray(value)

    default:
      return true
  }
}

function checkMinMax(value: unknown, fieldDef: FieldDef): string | null {
  if (fieldDef.min !== undefined) {
    if (typeof value === 'number' && value < fieldDef.min) {
      return `Value ${value} is below minimum ${fieldDef.min}`
    }
    if (typeof value === 'string' && value.length < fieldDef.min) {
      return `String length ${value.length} is below minimum ${fieldDef.min}`
    }
    if (Array.isArray(value) && value.length < fieldDef.min) {
      return `Array length ${value.length} is below minimum ${fieldDef.min}`
    }
  }
  if (fieldDef.max !== undefined) {
    if (typeof value === 'number' && value > fieldDef.max) {
      return `Value ${value} is above maximum ${fieldDef.max}`
    }
    if (typeof value === 'string' && value.length > fieldDef.max) {
      return `String length ${value.length} is above maximum ${fieldDef.max}`
    }
    if (Array.isArray(value) && value.length > fieldDef.max) {
      return `Array length ${value.length} is above maximum ${fieldDef.max}`
    }
  }
  return null
}

/**
 * Validate a field value against its FieldDef schema.
 * Checks: required, type match, min/max, pattern, select options.
 * Does NOT check: secrets (use detectSecrets), uniqueness (stateful), relations (I/O).
 */
export function validateFieldValue(value: unknown, fieldDef: FieldDef): ValidationError[] {
  const issues: ValidationError[] = []

  if (fieldDef.required && (value === undefined || value === null || value === '')) {
    issues.push({ severity: 'error', message: 'Required field is missing or empty' })
    return issues
  }

  if (value === undefined || value === null) return issues

  if (!fieldTypeMatches(value, fieldDef)) {
    issues.push({ severity: 'error', message: `Type mismatch: expected ${fieldDef.type}, got ${typeof value}` })
    return issues
  }

  const minMaxErr = checkMinMax(value, fieldDef)
  if (minMaxErr) {
    issues.push({ severity: 'error', message: minMaxErr })
  }

  if (fieldDef.pattern && typeof value === 'string') {
    try {
      const regex = new RegExp(fieldDef.pattern)
      if (!regex.test(value)) {
        issues.push({ severity: 'error', message: `Value "${value}" does not match pattern /${fieldDef.pattern}/` })
      }
    } catch {
      issues.push({ severity: 'warning', message: `Invalid pattern regex: ${fieldDef.pattern}` })
    }
  }

  if (fieldDef.type === 'select' && fieldDef.options && typeof value === 'string') {
    if (!fieldDef.options.includes(value)) {
      issues.push({ severity: 'error', message: `Value "${value}" is not in allowed options: [${fieldDef.options.join(', ')}]` })
    }
  }

  return issues
}

// ─── Serialize: Pure Functions ───

/** Recursively sort object keys — respects optional fieldOrder for top-level keys */
export function sortKeys(obj: unknown, fieldOrder?: string[]): unknown {
  if (obj === null || obj === undefined) return undefined
  if (Array.isArray(obj)) return obj.map(item => sortKeys(item, fieldOrder))
  if (typeof obj !== 'object') return obj

  const record = obj as Record<string, unknown>
  const sorted: Record<string, unknown> = {}

  const keys = fieldOrder
    ? [...new Set([...fieldOrder, ...Object.keys(record).toSorted()])]
    : Object.keys(record).toSorted()

  for (const key of keys) {
    if (!(key in record)) continue
    const val = record[key]
    if (val === null || val === undefined) continue
    sorted[key] = sortKeys(val)
  }

  return sorted
}

/** Canonical JSON serialization — deterministic output for stable git diffs */
export function canonicalStringify(data: unknown, fieldOrder?: string[]): string {
  const sorted = sortKeys(data, fieldOrder)
  return `${JSON.stringify(sorted, null, 2)}\n`
}

/** Generate a 12-character hex entry ID */
export function generateEntryId(): string {
  const hex = '0123456789abcdef'
  let id = ''
  for (let i = 0; i < 12; i++) {
    id += hex[Math.floor(Math.random() * 16)]
  }
  return id
}

// ─── Markdown Frontmatter ───

function parseYamlValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

function yamlScalar(value: unknown): string {
  const str = String(value)
  if (str.includes(':') || str.includes('#') || str.includes('{') || str.includes('}')
    || str.includes('[') || str.includes(']') || str.includes('*') || str.includes('&')
    || str.includes('!') || str.includes('|') || str.includes('>') || str.includes("'")
    || str.includes('"') || str.includes('%') || str.includes('@') || str.includes('`')
    || str.startsWith('-') || str.startsWith('?')
    || str === 'true' || str === 'false' || str === 'null' || str === 'yes' || str === 'no'
    || str === '') {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return str
}

function serializeYamlValue(value: unknown, indent: number): string[] {
  const pad = '  '.repeat(indent)
  if (value === null || value === undefined) return []
  if (typeof value === 'object' && !Array.isArray(value)) {
    const lines: string[] = []
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null || v === undefined) continue
      if (typeof v === 'object' && !Array.isArray(v)) {
        lines.push(`${pad}${k}:`)
        lines.push(...serializeYamlValue(v, indent + 1))
      } else if (Array.isArray(v)) {
        lines.push(`${pad}${k}:`)
        for (const item of v) {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            const nested = serializeYamlValue(item, indent + 2)
            if (nested.length > 0) {
              lines.push(`${pad}  - ${nested[0]!.trimStart()}`)
              lines.push(...nested.slice(1))
            }
          } else {
            lines.push(`${pad}  - ${yamlScalar(item)}`)
          }
        }
      } else {
        lines.push(`${pad}${k}: ${yamlScalar(v)}`)
      }
    }
    return lines
  }
  if (Array.isArray(value)) {
    const lines: string[] = []
    for (const item of value) {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const nested = serializeYamlValue(item, indent + 1)
        if (nested.length > 0) {
          lines.push(`${pad}- ${nested[0]!.trimStart()}`)
          lines.push(...nested.slice(1))
        }
      } else {
        lines.push(`${pad}- ${yamlScalar(item)}`)
      }
    }
    return lines
  }
  return [`${pad}${yamlScalar(value)}`]
}

function serializeYamlFields(data: Record<string, unknown>): string[] {
  const lines: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (key === 'body') continue
    if (value === null || value === undefined) continue
    if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${key}:`)
      lines.push(...serializeYamlValue(value, 1))
    } else if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const nested = serializeYamlValue(item, 2)
          if (nested.length > 0) {
            lines.push(`  - ${nested[0]!.trimStart()}`)
            lines.push(...nested.slice(1))
          }
        } else {
          lines.push(`  - ${yamlScalar(item)}`)
        }
      }
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`)
    }
  }
  return lines
}

/** Parse markdown frontmatter — extracts YAML frontmatter and body from a markdown string */
export function parseMarkdownFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: normalized }

  const frontmatterStr = match[1]!
  const body = match[2]!.trim()
  const frontmatter: Record<string, unknown> = {}

  let currentKey: string | null = null
  let currentArray: string[] | null = null

  for (const line of frontmatterStr.split('\n')) {
    if (/^\s+-\s+/.test(line) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim()
      if (!currentArray) currentArray = []
      currentArray.push(value)
      continue
    }

    if (currentKey && currentArray) {
      frontmatter[currentKey] = currentArray
      currentKey = null
      currentArray = null
    }

    const kvMatch = line.match(/^([\w][\w.-]*)\s*:\s*(.*)$/)
    if (!kvMatch) continue

    const key = kvMatch[1]!
    const rawValue = kvMatch[2]!.trim()

    if (rawValue === '') {
      currentKey = key
      currentArray = []
      continue
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const items = rawValue.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      frontmatter[key] = items
      continue
    }

    frontmatter[key] = parseYamlValue(rawValue)
  }

  if (currentKey && currentArray) {
    frontmatter[currentKey] = currentArray
  }

  return { frontmatter, body }
}

/** Serialize data + body into markdown frontmatter format */
export function serializeMarkdownFrontmatter(data: Record<string, unknown>, body: string): string {
  const trimmedBody = body.trimStart()
  if (trimmedBody.startsWith('---')) {
    const endIdx = trimmedBody.indexOf('---', 3)
    if (endIdx > 0) {
      const bodyFmContent = trimmedBody.slice(3, endIdx).trim()
      const afterFm = trimmedBody.slice(endIdx + 3)

      const lines: string[] = ['---']
      lines.push(...serializeYamlFields(data))
      if (bodyFmContent) {
        const modelKeys = new Set(Object.keys(data))
        for (const line of bodyFmContent.split('\n')) {
          if (line.length > 0 && line[0] !== ' ' && line[0] !== '-') {
            const colonIdx = line.indexOf(':')
            const lineKey = colonIdx > 0 ? line.slice(0, colonIdx).trim() : ''
            if (lineKey && modelKeys.has(lineKey)) continue
          }
          lines.push(line)
        }
      }
      lines.push('---')
      if (afterFm.trim()) {
        lines.push(afterFm.trimStart())
      }
      lines.push('')
      return lines.join('\n')
    }
  }

  const lines: string[] = ['---']
  lines.push(...serializeYamlFields(data))
  lines.push('---')
  lines.push('')
  if (body) {
    lines.push(body)
    lines.push('')
  }
  return lines.join('\n')
}
