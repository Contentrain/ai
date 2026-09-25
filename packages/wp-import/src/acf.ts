// ACF / Secure Custom Fields → Contentrain field types. One deterministic, versioned table.
//
// The ACF type is read from the source where it is stated — SCF's REST `<name>_source.type`, a
// Bridge export's field schema — and only inferred from the value's shape when nothing states it
// (plain ACF REST, WXR meta). Content is never retyped: a value is carried, converted to the shape its
// Contentrain type promises (an image object becomes its URL, a link its `{ url, title, target }`).
//
// Relations (post object, relationship, taxonomy, user, gallery, page link) are resolved by the
// caller, which knows the store's entry ids; this module says which kind of reference each one is.

import type { FieldDef, FieldType } from '@contentrain/types'
import { byValue, strip } from './core.js'

/** Table version: bump when a mapping changes, so a store says which rules made it. */
export const ACF_MAPPING_VERSION = 1

/** ACF types that never carry content (layout) or must never be read (secrets). */
export const ACF_LAYOUT_TYPES = new Set(['tab', 'accordion', 'message'])
export const ACF_SECRET_TYPES = new Set(['password'])

/**
 * ACF type → Contentrain type, for types whose value maps without a lookup.
 * `select` with `multiple` and `checkbox` are arrays of their options; see `acfFieldDef`.
 */
export const ACF_SCALAR_TYPES: Readonly<Record<string, FieldType>> = {
  text: 'string',
  textarea: 'text',
  wysiwyg: 'richtext',
  email: 'email',
  url: 'url',
  oembed: 'url',
  number: 'number',
  range: 'number',
  true_false: 'boolean',
  date_picker: 'date',
  date_time_picker: 'datetime',
  time_picker: 'string',
  color_picker: 'color',
  icon_picker: 'icon',
  select: 'select',
  radio: 'select',
  button_group: 'select',
  image: 'image',
  file: 'file',
}

/** References the caller resolves to store entries. */
export type AcfReference = 'post' | 'term' | 'user' | 'media' | 'address'
export const ACF_REFERENCE_TYPES: Readonly<Record<string, AcfReference>> = {
  post_object: 'post',
  relationship: 'post',
  taxonomy: 'term',
  user: 'user',
  gallery: 'media',
  page_link: 'address',
}

/**
 * Names that mean a secret whatever the field's type, for sources that do not state the type: whole words
 * of the name (`user_pass`, `apiKey`, `client-secret`), so `passage_text` or `compass` stay content.
 */
const SECRET_NAME = /(?:^|_)(?:pass(?:word|wd)?|secret|token|api_?key|private_?key|credentials?)(?:_|$)/i
const secretName = (name: string): boolean => SECRET_NAME.test(name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_'))

/** Whether a field must never be read: a secret by type, or — when the type is unknown — by name. */
export function acfIsSecret(name: string, type: string | undefined): boolean {
  if (type) return ACF_SECRET_TYPES.has(type)
  return secretName(name)
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const SOURCE = '_source'
/** The ACF type SCF states for a sub-field of a row or group (`<name>_source.type`). */
const statedType = (row: Record<string, unknown>, k: string): string | undefined => {
  const s = row[`${k}${SOURCE}`]
  return isRecord(s) && typeof s.type === 'string' ? s.type : undefined
}
/** A sub-field that carries nothing to keep: a secret (stated, or by name) or a layout field. */
const droppedKey = (row: Record<string, unknown>, k: string): boolean => {
  const t = statedType(row, k)
  return (t !== undefined && ACF_LAYOUT_TYPES.has(t)) || acfIsSecret(k, t)
}

/**
 * An ACF value with every secret sub-field removed, at any depth: repeater rows, groups, flexible layouts.
 * A sub-field's `_source` keeps only its type and label — its `formatted_value` repeats the value.
 */
export function acfScrub(value: unknown, secret: ReadonlySet<string> = new Set()): unknown {
  if (Array.isArray(value)) {
    // Rows of one repeater or layout share their sub-fields: a key one row states as secret is secret in every row.
    const rows = value.filter(isRecord)
    const shared = new Set([...secret, ...rows.flatMap((r) => Object.keys(r).filter((k) => !k.endsWith(SOURCE) && droppedKey(r, k)))])
    return value.map((v) => acfScrub(v, shared))
  }
  if (!isRecord(value)) return value
  const gone = (k: string) => secret.has(k) || droppedKey(value, k)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (k.endsWith(SOURCE) && k.length > SOURCE.length) {
      const base = k.slice(0, -SOURCE.length)
      if (gone(base) || !isRecord(v)) continue
      out[k] = { ...(typeof v.type === 'string' ? { type: v.type } : {}), ...(typeof v.label === 'string' ? { label: v.label } : {}) }
      continue
    }
    if (gone(k)) continue
    out[k] = acfScrub(v)
  }
  return out
}
/** ACF's image/file array (`return_format: array`): `{ ID, url, filename, … }`. */
const isAttachment = (v: unknown): v is { url: string } => isRecord(v) && typeof v.url === 'string' && ('ID' in v || 'id' in v) && ('filename' in v || 'mime_type' in v)
const isLink = (v: unknown): v is { url: string; title?: string; target?: string } => isRecord(v) && typeof v.url === 'string' && 'title' in v && 'target' in v && Object.keys(v).length <= 3
const isMap = (v: unknown): boolean => isRecord(v) && typeof v.lat === 'number' && typeof v.lng === 'number'
/** A date picker's stored value (`Ymd`) → ISO date. */
const ymd = (v: unknown): string | null => (typeof v === 'string' && /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null)
/** `Y-m-d H:i:s` → ISO datetime (site time, no zone: WordPress stores it that way). */
const dt = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? v.replace(' ', 'T') : null)

const LINK_FIELDS: Record<string, FieldDef> = { url: { type: 'url' }, title: { type: 'string' }, target: { type: 'string' } }
const MAP_FIELDS: Record<string, FieldDef> = { address: { type: 'string' }, lat: { type: 'decimal' }, lng: { type: 'decimal' }, zoom: { type: 'integer' } }

/** Contentrain type of a sub-value whose ACF type is not stated (a repeater row, a group member). */
function inferDef(value: unknown): FieldDef | null {
  if (value === null || value === undefined || value === '') return null
  if (isAttachment(value)) return { type: /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(value.url) ? 'image' : 'file' }
  if (isLink(value)) return { type: 'object', fields: LINK_FIELDS }
  if (isMap(value)) return { type: 'object', fields: MAP_FIELDS }
  if (Array.isArray(value)) {
    if (value.every(isRecord)) return { type: 'array', items: { type: 'object', fields: rowFields(value as Record<string, unknown>[]) } }
    const item = value.map(inferDef).find(Boolean)
    return { type: 'array', items: item?.type === 'object' ? item : (item?.type ?? 'string') }
  }
  if (isRecord(value)) return { type: 'object', fields: rowFields([value]) }
  if (ymd(value)) return { type: 'date' }
  const t = byValue(value)
  return t ? { type: t as FieldType } : null
}

/** The union of the fields every row states; a name typed two ways falls back to `string`. */
function rowFields(rows: Record<string, unknown>[]): Record<string, FieldDef> {
  const out: Record<string, FieldDef> = {}
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (k.endsWith(SOURCE) || droppedKey(row, k)) continue
      const d = inferDef(v)
      if (!d) continue
      const seen = out[k]
      if (!seen) out[k] = d
      else if (seen.type !== d.type) out[k] = { type: 'string' }
    }
  }
  return out
}

/** A value in the shape its field definition promises; `undefined` = nothing to store. */
export function acfValue(def: FieldDef, value: unknown): unknown {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return undefined
  switch (def.type) {
    case 'image':
    case 'file':
    case 'video':
      return isAttachment(value) ? value.url : typeof value === 'string' ? value : undefined
    case 'date':
      return ymd(value) ?? (typeof value === 'string' ? value : undefined)
    case 'datetime':
      return dt(value) ?? (typeof value === 'string' ? value : undefined)
    case 'boolean':
      return value === true || value === 1 || value === '1'
    case 'number':
    case 'integer':
    case 'decimal':
      return typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : undefined
    case 'icon':
      return isRecord(value) && typeof value.value === 'string' ? value.value : typeof value === 'string' ? value : undefined
    case 'object': {
      if (!isRecord(value)) return undefined
      const out: Record<string, unknown> = {}
      for (const [k, sub] of Object.entries(def.fields ?? {})) {
        // Another row may have typed the name; this one says it is a secret.
        if (droppedKey(value, k)) continue
        const v = acfValue(sub, value[k])
        if (v !== undefined) out[k] = v
      }
      return Object.keys(out).length ? out : undefined
    }
    case 'array': {
      if (!Array.isArray(value)) return undefined
      const item: FieldDef = typeof def.items === 'string' ? { type: def.items as FieldType } : (def.items ?? { type: 'string' })
      const out = value.map((v) => acfValue(item, v)).filter((v) => v !== undefined)
      return out.length ? out : undefined
    }
    case 'richtext':
    case 'text':
    case 'string':
    case 'select':
    case 'url':
    case 'email':
    case 'color':
      return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
    default:
      return value
  }
}

export interface AcfStated {
  /** ACF type as the source states it (`_source.type`, Bridge schema); absent = infer from the value. */
  type?: string
  label?: string
  /** Choices of a select/radio/checkbox/button group, when the source states them. */
  choices?: string[]
  multiple?: boolean
}

/**
 * Field definition for one ACF field value, or `null` when it carries no content, is a secret, or is a
 * reference (the caller resolves those: see `ACF_REFERENCE_TYPES`).
 */
export function acfFieldDef(name: string, value: unknown, stated: AcfStated = {}): FieldDef | null {
  const t = stated.type
  if (t && (ACF_LAYOUT_TYPES.has(t) || ACF_REFERENCE_TYPES[t])) return null
  if (acfIsSecret(name, t)) return null
  const label = stated.label ? strip(stated.label) : undefined
  const withLabel = (d: FieldDef): FieldDef => (label ? { ...d, label } : d)
  if (!t) {
    const inferred = inferDef(value)
    return inferred ? withLabel({ ...inferred, description: 'ACF (type inferred from the value)' }) : null
  }
  const choices = stated.choices?.length ? stated.choices : undefined
  if (t === 'checkbox' || (t === 'select' && (stated.multiple || Array.isArray(value)))) {
    return withLabel({ type: 'array', items: choices ? { type: 'select', options: choices } : 'string' })
  }
  if (ACF_SCALAR_TYPES[t]) {
    const type = ACF_SCALAR_TYPES[t]!
    if (type === 'select') return withLabel(choices ? { type, options: choices } : { type: 'string' })
    return withLabel({ type })
  }
  if (t === 'link') return withLabel({ type: 'object', fields: LINK_FIELDS })
  if (t === 'google_map') return withLabel({ type: 'object', fields: MAP_FIELDS })
  if (t === 'group') return withLabel({ type: 'object', fields: rowFields(isRecord(value) ? [value] : []) })
  if (t === 'repeater') return withLabel({ type: 'array', items: { type: 'object', fields: rowFields(Array.isArray(value) ? value.filter(isRecord) : []) } })
  if (t === 'flexible_content') {
    // One row per layout instance, in order; `layout` names which layout made it, the rest is the union of their fields.
    const rows = Array.isArray(value) ? value.filter(isRecord) : []
    const fields = rowFields(rows.map(({ acf_fc_layout: _l, ...rest }) => rest))
    const layouts = [...new Set(rows.map((r) => String(r.acf_fc_layout ?? '')).filter(Boolean))].toSorted()
    return withLabel({ type: 'array', items: { type: 'object', fields: { layout: { type: 'select', options: layouts, required: true }, ...fields } } })
  }
  // An ACF type this table does not know (a third-party field type): infer, and say so.
  const inferred = inferDef(value)
  return inferred ? withLabel({ ...inferred, description: `ACF ${t} (type inferred from the value)` }) : null
}

/** Merge two definitions of the same field seen on different entries (union of object fields and options). */
export function mergeFieldDef(a: FieldDef, b: FieldDef): FieldDef {
  if (a.type !== b.type) return a
  const out: FieldDef = { ...a }
  if (a.options || b.options) out.options = [...new Set([...(a.options ?? []), ...(b.options ?? [])])].toSorted()
  if (a.fields || b.fields) {
    const fields: Record<string, FieldDef> = { ...a.fields }
    for (const [k, d] of Object.entries(b.fields ?? {})) fields[k] = fields[k] ? mergeFieldDef(fields[k]!, d) : d
    out.fields = fields
  }
  if (typeof a.items === 'object' && typeof b.items === 'object') out.items = mergeFieldDef(a.items, b.items)
  return out
}

/** Flexible content rows keep their layout name under `layout`. */
export function acfRows(value: unknown): unknown {
  return Array.isArray(value) ? value.map((r) => (isRecord(r) && 'acf_fc_layout' in r ? (({ acf_fc_layout, ...rest }) => ({ layout: acf_fc_layout, ...rest }))(r) : r)) : value
}
