/**
 * @contentrain/ai-rules — Programmatic exports
 *
 * Constants and metadata for rule files, skills, and the Contentrain type system.
 * Used by CLI (`contentrain init`) and build scripts to reference the correct files.
 */

// ─── Field Types (27 flat types, no sub-formats) ───

export const FIELD_TYPES = [
  // String family (11)
  'string', 'text', 'email', 'url', 'slug',
  'color', 'phone', 'code', 'icon',
  'markdown', 'richtext',
  // Number family (5)
  'number', 'integer', 'decimal', 'percent', 'rating',
  // Primitives (3)
  'boolean', 'date', 'datetime',
  // Media (3)
  'image', 'video', 'file',
  // Relations (2)
  'relation', 'relations',
  // Structural (3)
  'select', 'array', 'object',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

// ─── Model Kinds ───

export const MODEL_KINDS = [
  'singleton',
  'collection',
  'document',
  'dictionary',
] as const

export type ModelKind = (typeof MODEL_KINDS)[number]

// ─── MCP Tools (13 tools) ───

export const MCP_TOOLS = [
  'contentrain_status',
  'contentrain_describe',
  'contentrain_init',
  'contentrain_scaffold',
  'contentrain_model_save',
  'contentrain_model_delete',
  'contentrain_content_save',
  'contentrain_content_delete',
  'contentrain_content_list',
  'contentrain_scan',
  'contentrain_apply',
  'contentrain_validate',
  'contentrain_submit',
] as const

export type McpTool = (typeof MCP_TOOLS)[number]

// ─── Rule Files ───

export const CONTENT_QUALITY_RULES = [
  'content-quality',
  'seo-rules',
  'i18n-quality',
  'accessibility-rules',
  'security-rules',
  'media-rules',
] as const

export const ARCHITECTURE_RULES = [
  'content-conventions',
  'schema-rules',
  'mcp-usage',
  'workflow-rules',
  'normalize-rules',
] as const

export const ALL_SHARED_RULES = [
  ...CONTENT_QUALITY_RULES,
  ...ARCHITECTURE_RULES,
] as const

// ─── IDE Rule File Paths ───

export const IDE_RULE_FILES = {
  'claude-code': 'rules/claude-code/contentrain.md',
  'cursor': 'rules/cursor/contentrain.cursorrules',
  'windsurf': 'rules/windsurf/contentrain.md',
  'generic': 'rules/generic/contentrain.md',
} as const

export type IdeTarget = keyof typeof IDE_RULE_FILES

// ─── Skill Files ───

export const SKILLS = [
  'contentrain-init',
  'contentrain-content',
  'contentrain-normalize',
  'contentrain-review',
  'contentrain-translate',
  'contentrain-generate',
] as const

// ─── Framework Templates ───

export const FRAMEWORKS = [
  'nuxt',
  'next',
  'astro',
  'sveltekit',
] as const

export type Framework = (typeof FRAMEWORKS)[number]

// ─── Stacks (superset of frameworks) ───

export const STACKS = [
  'nuxt',
  'next',
  'astro',
  'sveltekit',
  'react',
  'node',
] as const

export type Stack = (typeof STACKS)[number]
