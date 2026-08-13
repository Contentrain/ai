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

// ─── Model Definition Properties ───
//
// The parity anchor for the model schema. Docs describing `ModelDefinition` drift
// silently: nothing failed when a property landed in @contentrain/types and never
// reached schema-rules.md. The tests in tests/mcp-parity.test.ts assert this list
// against MODEL_FIELD_ORDER in @contentrain/mcp and against the prose tables.

export const MODEL_PROPERTIES = [
  { name: 'id', required: true },
  { name: 'name', required: true },
  { name: 'kind', required: true },
  { name: 'domain', required: true },
  { name: 'i18n', required: true },
  { name: 'title_field', required: true },
  { name: 'description', required: false },
  { name: 'content_path', required: false },
  { name: 'locale_strategy', required: false },
  // `required` here means "documented as required", not the TS optionality.
  // `fields` is `fields?` on the interface but every non-dictionary model needs
  // it — a collection with no fields cannot even name a title_field. The
  // per-kind nuance lives in the docs cell ("Yes (except dictionary)").
  { name: 'fields', required: true },
] as const

export type ModelProperty = (typeof MODEL_PROPERTIES)[number]['name']

// ─── MCP Tools (26 tools: 21 core + 5 media) ───

export const MCP_TOOLS = [
  'contentrain_status', 'contentrain_describe', 'contentrain_describe_format',
  'contentrain_init', 'contentrain_scaffold',
  'contentrain_model_save', 'contentrain_model_delete',
  'contentrain_content_save', 'contentrain_content_delete', 'contentrain_content_list',
  'contentrain_vocabulary_save', 'contentrain_vocabulary_delete',
  'contentrain_scan', 'contentrain_apply',
  'contentrain_validate', 'contentrain_submit',
  'contentrain_merge',
  'contentrain_branch_list', 'contentrain_branch_delete',
  'contentrain_bulk',
  'contentrain_doctor',
  // Media tools — registered only when the provider exposes a media stack
  // (Studio MCP Cloud); absent from local stdio servers.
  'contentrain_media_list', 'contentrain_media_get', 'contentrain_media_ingest',
  'contentrain_media_update', 'contentrain_media_delete',
] as const

export type McpTool = (typeof MCP_TOOLS)[number]

// ─── Essential Rules ───

export const ESSENTIAL_RULES_FILE = 'essential/contentrain-essentials.md' as const

// ─── Stacks ───

export const STACKS = ['nuxt', 'next', 'astro', 'sveltekit', 'react', 'node'] as const
export type Stack = (typeof STACKS)[number]
