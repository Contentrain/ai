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
    /**
     * Git host backing this project's remote. Widens as new providers ship
     * in @contentrain/mcp — `github` and `gitlab` are currently supported.
     * The value is informational for tooling: the concrete provider the
     * MCP server talks to is chosen at server construction time, not from
     * this config.
     */
    provider: 'github' | 'gitlab'
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
  /**
   * Public media delivery base for resolving relative `media/...` references to
   * absolute URLs (e.g. a deployed CDN delivery endpoint). When set,
   * `@contentrain/query`'s `generate` bakes a `media()` resolver into the
   * generated client. The base may already include any project segment — the
   * resolver only joins `{cdn.url}/{path}`. Distinct from `assets_path` (the
   * local on-disk asset directory).
   */
  cdn?: {
    url?: string
  }
  /** Days a merged `cr/*` branch is kept before lazy cleanup. Default: 30. */
  branchRetention?: number
  /** Unmerged `cr/*` branch count that triggers a warning. Default: 50. */
  branchWarnLimit?: number
  /** Unmerged `cr/*` branch count that blocks new writes. Default: 80. */
  branchBlockLimit?: number
  /**
   * Delete the remote copy of a `cr/*` branch when it is merged or deleted
   * locally, and allow lazy pruning of already-merged remote branches.
   * Read-only remote visibility (doctor, branch listing) is not affected.
   * Default: true.
   */
  remoteBranchCleanup?: boolean
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
  /** Content confidence score (0-1). Higher = more likely user-visible content. */
  contentScore: number
  /** All locations where this value appears (populated when dedup is enabled). */
  occurrences: Array<{ file: string; line: number }>
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
    skipped: number
    low_confidence: number
    unique_candidates: number
    candidates_returned: number
    has_more: boolean
    skip_reasons: Record<string, number>
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

// ─── Normalize Plan ───

export interface NormalizePlan {
  version: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  approved_at?: string
  agent: string
  scan_stats: {
    files_scanned: number
    raw_strings: number
    candidates_sent: number
    extracted: number
    skipped: number
  }
  models: NormalizePlanModel[]
  extractions: NormalizePlanExtraction[]
  patches: NormalizePlanPatch[]
  approved_models?: string[]
}

export interface NormalizePlanModel {
  id: string
  kind: ModelKind
  domain: string
  i18n?: boolean
  fields: Record<string, FieldDef>
}

export interface NormalizePlanExtraction {
  value: string
  file: string
  line: number
  model: string
  field: string
  locale?: string
}

export interface NormalizePlanPatch {
  file: string
  line: number
  old_value: string
  new_expression: string
  import_statement?: string
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

// ─── Semantic type validation ───

/** Hex (#rgb/#rrggbb/#rrggbbaa), rgb()/rgba(), hsl()/hsla(), or a bare CSS keyword. */
const COLOR_PATTERN = /^(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|hsl)a?\([^)]*\)|[a-zA-Z]+)$/
/** Deliberately loose: digits, spaces, and the usual separators, 4-20 digits total. */
const PHONE_PATTERN = /^\+?[\d\s().-]{4,}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isParsableDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime())
}

/**
 * Rules a field type implies beyond its runtime `typeof`.
 *
 * Severity follows one rule: a check that is *definitional* is an error — a `slug`
 * that does not match `SLUG_PATTERN` is not a slug. A check that is a *heuristic* is
 * a warning, because the pattern is an approximation and a legitimate value may sit
 * outside it (international phone formats, CSS colour keywords).
 *
 * `rating` is deliberately absent: its scale is never declared, so any range here
 * would be invented. Declare `min`/`max` on the field instead.
 *
 * Returns `[]` for types whose only contract is their `typeof` (`string`, `text`,
 * `code`, `icon`, `markdown`, `richtext`, `number`, `decimal`, `boolean`, media).
 */
export function validateSemanticType(value: unknown, type: FieldType): ValidationError[] {
  if (typeof value === 'number') {
    if (type === 'integer' && !Number.isInteger(value)) {
      return [{ severity: 'error', message: `Value ${value} is not an integer` }]
    }
    if (type === 'percent' && (value < 0 || value > 100)) {
      return [{ severity: 'error', message: `Percent ${value} is outside 0-100` }]
    }
    return []
  }

  if (typeof value !== 'string' || value === '') return []

  switch (type) {
    case 'slug': {
      const err = validateSlug(value)
      return err ? [{ severity: 'error', message: err }] : []
    }
    case 'date':
      return DATE_PATTERN.test(value) && isParsableDate(value)
        ? []
        : [{ severity: 'error', message: `Invalid date "${value}": must be YYYY-MM-DD` }]
    case 'datetime':
      return isParsableDate(value)
        ? []
        : [{ severity: 'error', message: `Invalid datetime "${value}": must be an ISO 8601 date-time` }]
    case 'email':
      return EMAIL_PATTERN.test(value)
        ? []
        : [{ severity: 'warning', message: `"${value}" may not be a valid email` }]
    case 'url':
      return /^https?:\/\/.+/.test(value) || value.startsWith('/')
        ? []
        : [{ severity: 'warning', message: `"${value}" may not be a valid URL` }]
    case 'color':
      return COLOR_PATTERN.test(value)
        ? []
        : [{ severity: 'warning', message: `"${value}" may not be a valid color (expected hex, rgb(), hsl() or a keyword)` }]
    case 'phone':
      return PHONE_PATTERN.test(value) && (value.match(/\d/g)?.length ?? 0) >= 4
        ? []
        : [{ severity: 'warning', message: `"${value}" may not be a valid phone number` }]
    default:
      return []
  }
}

/** Media field types — the ones whose value is a path/URL to an asset. */
const MEDIA_TYPES = new Set<FieldType>(['image', 'video', 'file'])

export function isMediaType(type: FieldType): boolean {
  return MEDIA_TYPES.has(type)
}

/** Extensions we can name a MIME type for. Deliberately small — this is a sniff. */
const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  pdf: 'application/pdf', zip: 'application/zip', json: 'application/json',
  csv: 'text/csv', txt: 'text/plain',
}

/**
 * Check a media value's file extension against an `accept` list.
 *
 * This is an approximation and says so: the value is a path or URL, so the real
 * MIME type is only knowable where the bytes are — the provider, at ingest
 * (`provider.ts:MediaProvider.ingest` owns that policy). An extension can lie, and
 * an unknown extension is not evidence of a violation. Hence: warning, never error,
 * and silence when we cannot tell.
 *
 * `accept` follows the HTML input syntax: `image/jpeg`, `image/*`, `.jpg`, comma-separated.
 */
export function validateAccept(value: string, accept: string): ValidationError[] {
  const path = value.split('?')[0]?.split('#')[0] ?? value
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext || ext === path.toLowerCase()) return []

  const mime = EXTENSION_MIME[ext]
  const patterns = accept.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
  if (patterns.length === 0) return []

  const matches = patterns.some((p) => {
    if (p.startsWith('.')) return p.slice(1) === ext
    if (p.endsWith('/*')) return mime ? mime.startsWith(p.slice(0, -1)) : false
    return mime === p
  })
  if (matches) return []

  // An extension we have no MIME for is not evidence of a violation.
  if (!mime && !patterns.some(p => p.startsWith('.'))) return []

  return [{
    severity: 'warning',
    message: `File extension ".${ext}" does not match accept "${accept}" (extension check — the provider enforces the real MIME type at ingest)`,
  }]
}

/**
 * Validate a field value against its FieldDef schema.
 * Checks: required, type match, semantic type rules, min/max, pattern, select
 * options, and `accept` on media fields (by extension).
 * Does NOT check: secrets (use detectSecrets), uniqueness (stateful), relations (I/O),
 * or `maxSize` — byte length is not knowable from a stored path.
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

  issues.push(...validateSemanticType(value, fieldDef.type))

  if (fieldDef.accept && isMediaType(fieldDef.type) && typeof value === 'string') {
    issues.push(...validateAccept(value, fieldDef.accept))
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

// ─── Repository provider contracts ───
//
// Provider-agnostic engine contracts used by @contentrain/mcp. Exposed from
// @contentrain/types so third-party tools can implement a custom
// RepoProvider without taking a dependency on @contentrain/mcp.
export type {
  ApplyPlanInput,
  Branch,
  Commit,
  CommitAuthor,
  FileChange,
  FileDiff,
  MediaAsset,
  MediaIngestInput,
  MediaListOptions,
  MediaListResult,
  MediaProvider,
  MediaUpdateInput,
  MergeResult,
  ProviderCapabilities,
  RepoProvider,
  RepoReader,
  RepoWriter,
} from './provider.js'
export { LOCAL_CAPABILITIES } from './provider.js'
