import type { FieldDef, FieldType } from './index.js'

/**
 * Media path → delivery URL rewriting. The single source of truth for how a
 * stored `media/...` reference becomes an absolute delivery URL — every
 * reader of Contentrain content that resolves this at read or write time
 * shares this module, so the rules can only be defined once.
 *
 * Two independent consumers need the exact same answer: `@contentrain/mcp`'s
 * `planContentSave` normalizes on write, for hosted/cloud mode, so a
 * git-committed value is ready to use with no SDK; `@contentrain/query`
 * resolves the same relative paths at read time, for the local-file model
 * (the generated client, the Astro loader, raw markdown) where nothing
 * upstream rewrote them. A second, hand-rolled implementation on either side
 * drifts the moment one of the rules below changes — titled markdown embeds,
 * an HTML `src`/`href`, or a media field nested inside an `object`/`array`
 * were all missed by an earlier, separate read-side implementation before
 * this module existed.
 *
 * Only image/video/file fields (resolved via the model schema, including those
 * nested in object/array fields) and `media/...` src/href targets in
 * markdown/HTML are rewritten. External URLs (`http(s)://`, `//`, `data:`) and
 * already-absolute delivery URLs pass through untouched, so every entry point
 * is idempotent and safe to call repeatedly. No base means no-op — the
 * relative path is kept verbatim, which is the OSS local-file model's default.
 */

const MEDIA_FIELD_TYPES = new Set<FieldType>(['image', 'video', 'file'])

/**
 * Whether a stored field value is a relative media-storage path (`media/...`)
 * rather than an already-absolute URL or external link. Only these are
 * rewritten to delivery URLs — `http(s)://`, `//`, and `data:` are left as-is.
 */
export function isStoredMediaPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('media/')
}

/** Join a relative media path onto the per-project delivery base. */
export function toDeliveryUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path}`
}

/**
 * Rewrite a stored media path to its absolute delivery URL. Non-media values
 * (external URLs, empty, non-strings) pass through untouched, so this is safe
 * to call on any field value.
 */
export function rewriteMediaUrl(base: string, value: unknown): unknown {
  return isStoredMediaPath(value) ? toDeliveryUrl(base, value) : value
}

/**
 * Rewrite media paths within a single field value, guided by its FieldDef so
 * only media fields — including those nested inside object/array fields — are
 * touched. Non-media values pass through.
 */
export function rewriteFieldMedia(value: unknown, field: FieldDef, base: string): unknown {
  if (value == null) return value

  if (MEDIA_FIELD_TYPES.has(field.type))
    return rewriteMediaUrl(base, value)

  if (field.type === 'object' && field.fields && typeof value === 'object' && !Array.isArray(value))
    return rewriteEntryMedia(value as Record<string, unknown>, field.fields, base)

  if (field.type === 'array' && Array.isArray(value)) {
    const itemDef: FieldDef | null = typeof field.items === 'string'
      ? { type: field.items as FieldType }
      : field.items ?? null
    if (!itemDef) return value
    return value.map(v => rewriteFieldMedia(v, itemDef, base))
  }

  return value
}

/**
 * Rewrite media paths across one entry/frontmatter object using a field map.
 * Returns a shallow copy (the input is never mutated); a no-op when the object
 * has no media fields.
 */
export function rewriteEntryMedia(
  entry: Record<string, unknown>,
  fields: Record<string, FieldDef>,
  base: string,
): Record<string, unknown> {
  const out = { ...entry }
  for (const [fieldId, field] of Object.entries(fields)) {
    if (fieldId in out)
      out[fieldId] = rewriteFieldMedia(out[fieldId], field, base)
  }
  return out
}

/** Rewrite `media/...` markdown image/link targets and inline src/href attrs. */
export function rewriteMarkdownMedia(body: string, base: string): string {
  return body
    // markdown image/link target: ](media/...) — stops at whitespace, ) or "
    .replace(/(\]\()(media\/[^)\s"]+)/g, (_m, open, p) => `${open}${toDeliveryUrl(base, p)}`)
    // inline HTML src=/href="media/..."
    .replace(/(\s(?:src|href)=)(["'])(media\/[^"']+)\2/gi,
      (_m, attr, quote, p) => `${attr}${quote}${toDeliveryUrl(base, p)}${quote}`)
}
