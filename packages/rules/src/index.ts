/**
 * @contentrain/rules — AI agent rules for Contentrain
 *
 * Quality standards, architecture conventions, and IDE integration.
 */

// ─── Field Types (27 flat types) ───

export const FIELD_TYPES = [
  'string', 'text', 'email', 'url', 'slug', 'color', 'phone', 'code', 'icon',
  'markdown', 'richtext',
  'number', 'integer', 'decimal', 'percent', 'rating',
  'boolean', 'date', 'datetime',
  'image', 'video', 'file',
  'relation', 'relations',
  'select', 'array', 'object',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

// ─── Model Kinds ───

export const MODEL_KINDS = ['singleton', 'collection', 'document', 'dictionary'] as const
export type ModelKind = (typeof MODEL_KINDS)[number]

// ─── MCP Tools (15 tools) ───

export const MCP_TOOLS = [
  'contentrain_status', 'contentrain_describe', 'contentrain_describe_format',
  'contentrain_init', 'contentrain_scaffold',
  'contentrain_model_save', 'contentrain_model_delete',
  'contentrain_content_save', 'contentrain_content_delete', 'contentrain_content_list',
  'contentrain_scan', 'contentrain_apply',
  'contentrain_validate', 'contentrain_submit',
  'contentrain_bulk',
] as const

export type McpTool = (typeof MCP_TOOLS)[number]

// ─── Rule Sets ───

export const CONTENT_QUALITY_RULES = [
  'content-quality', 'seo-rules', 'i18n-quality',
  'accessibility-rules', 'security-rules', 'media-rules',
] as const

export const ARCHITECTURE_RULES = [
  'content-conventions', 'schema-rules', 'mcp-usage',
  'workflow-rules', 'normalize-rules',
] as const

export const ALL_SHARED_RULES = [...CONTENT_QUALITY_RULES, ...ARCHITECTURE_RULES] as const

// ─── IDE Rule Paths ───

export const IDE_RULE_FILES = {
  'claude-code': 'ide/claude-code/contentrain.md',
  'cursor': 'ide/cursor/contentrain.cursorrules',
  'windsurf': 'ide/windsurf/contentrain.windsurfrules',
  'generic': 'ide/generic/contentrain.md',
} as const

export type IdeTarget = keyof typeof IDE_RULE_FILES

// ─── Stacks ───

export const STACKS = ['nuxt', 'next', 'astro', 'sveltekit', 'react', 'node'] as const
export type Stack = (typeof STACKS)[number]
