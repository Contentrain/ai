// src/content.config.ts from the project's models: one collection per model,
// loaded with @contentrain/query's loader, with a zod schema that mirrors the
// model's fields. Written, not hand-kept, so a model and its schema cannot
// drift — a field an editor adds in Studio fails the build until the models
// are regenerated.
//
// Schemas are exact about shape and lenient about values WordPress data is
// loose with: URLs and emails are strings (imported links can be relative,
// imported emails malformed), dates are coerced. An optional boolean defaults
// to false and an optional relation list to [], so pages can use them
// without checks.

import type { FieldDef, ModelDefinition } from '@contentrain/types'

/** Collection name for a model id: `menu-items` → `menuItems`. */
export function collectionName(modelId: string): string {
  return modelId.replace(/[-_]+([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
}

/** A string literal in the generated source's quote style. */
const sq = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const STRING_TYPES = new Set(['string', 'text', 'email', 'url', 'slug', 'color', 'phone', 'code', 'icon', 'markdown', 'richtext', 'image', 'video', 'file'])
const NUMBER_TYPES = new Set(['number', 'decimal', 'percent', 'rating'])

function base(field: FieldDef, known: ReadonlySet<string>): string {
  const type = field.type
  if (STRING_TYPES.has(type)) return 'z.string()'
  if (NUMBER_TYPES.has(type)) return 'z.number()'
  if (type === 'integer') return 'z.number().int()'
  if (type === 'boolean') return 'z.boolean()'
  if (type === 'date' || type === 'datetime') return 'z.coerce.date()'
  if (type === 'select') return field.options?.length ? `z.enum([${field.options.map(sq).join(', ')}])` : 'z.string()'
  if (type === 'relation' || type === 'relations') {
    // A polymorphic relation stores { model, ref }; a single-model one, the target's id.
    const target = typeof field.model === 'string' && known.has(field.model) ? `reference(${sq(collectionName(field.model))})` : 'z.object({ model: z.string(), ref: z.string() })'
    return type === 'relation' ? target : `z.array(${target})`
  }
  if (type === 'array') {
    const items = field.items
    const item = items === undefined ? 'z.unknown()' : typeof items === 'string' ? base({ type: items } as FieldDef, known) : base(items, known)
    return `z.array(${item})`
  }
  if (type === 'object') return field.fields ? objectSchema(field.fields, known, '    ') : 'z.record(z.string(), z.unknown())'
  return 'z.unknown()'
}

function fieldSchema(field: FieldDef, known: ReadonlySet<string>): string {
  const schema = base(field, known)
  if (field.required) return schema
  if (field.type === 'boolean') return `${schema}.default(${field.default === true})`
  if (field.type === 'relations') return `${schema}.default([])`
  if (field.default !== undefined && field.default !== null && typeof field.default !== 'object') return `${schema}.default(${JSON.stringify(field.default)})`
  return `${schema}.optional()`
}

function objectSchema(fields: Record<string, FieldDef>, known: ReadonlySet<string>, indent: string): string {
  const lines = Object.keys(fields).toSorted().map(name => `${indent}  ${/^[a-z_$][\w$]*$/i.test(name) ? name : sq(name)}: ${fieldSchema(fields[name]!, known)},`)
  return `z.object({\n${lines.join('\n')}\n${indent}})`
}

/** The zod schema expression of one model's entries, as the loader shapes them. */
export function modelSchema(model: ModelDefinition, known: ReadonlySet<string>): string {
  const locale = model.i18n ? '\n      locale: z.string().optional(),' : ''
  if (model.kind === 'dictionary') return `z.object({ key: z.string(), value: z.string(), locale: z.string().optional() })`
  const fields = objectSchema(model.fields ?? {}, known, '    ')
  // The loader adds `id` to collection entries and `slug` to documents; neither is a model field.
  const extra = model.kind === 'collection' ? `\n      id: z.string(),${locale}` : model.kind === 'document' ? `\n      slug: z.string(),${locale}` : locale
  return extra ? fields.replace('z.object({\n', `z.object({${extra}\n`) : fields
}

export function contentConfigSource(models: readonly ModelDefinition[]): string {
  const known = new Set(models.map(m => m.id))
  const usesReference = models.some(m => Object.values(m.fields ?? {}).some(function refers(f: FieldDef): boolean {
    return ((f.type === 'relation' || f.type === 'relations') && typeof f.model === 'string' && known.has(f.model))
      || Object.values(f.fields ?? {}).some(refers)
      || (typeof f.items === 'object' && refers(f.items))
  }))
  const collections = models.toSorted((a, b) => a.id.localeCompare(b.id)).map(model =>
    `  ${collectionName(model.id)}: defineCollection({\n    loader: loader(${sq(model.id)}),\n    schema: ${modelSchema(model, known)},\n  }),`)
  return `// Generated from .contentrain/models by @contentrain/writer — regenerate, do not edit.
//
// One collection per Contentrain model, read through @contentrain/query's
// loader; each schema mirrors its model. Public builds show published
// entries only: drafts and entries in review stay in Studio until approved.

import { contentrainLoader } from '@contentrain/query/astro'
import { defineCollection${usesReference ? ', reference' : ''} } from 'astro:content'
import { z } from 'astro/zod'

const loader = (model: string) => contentrainLoader({ model, publishedOnly: true })

export const collections = {
${collections.join('\n')}
}
`
}
