import type { FieldDef, FieldType } from '@contentrain/types'

/**
 * Media path → delivery URL rewriting for MCP content writes.
 *
 * Ported from Studio's `server/utils/media-rewrite.ts`, with one deliberate
 * difference: Studio derives the delivery base from a `projectId` plus its
 * runtime config, whereas MCP receives the fully-qualified per-project base
 * directly via `RepoProvider.mediaBaseUrl`
 * (`{siteUrl}/api/cdn/v1/{projectId}` — the project segment is already
 * included). So here `toDeliveryUrl` is a single `{base}/{path}` join.
 *
 * Why this exists: Studio stores uploaded media in CDN/R2 and references it
 * from content by a relative storage path (`media/...`). That path renders
 * nowhere on its own — it must become an absolute, public delivery URL before
 * it reaches a browser. When an external agent writes through MCP Cloud, the
 * write bypasses Studio's content-engine and goes straight through
 * `planContentSave`, so this is where the normalization has to happen: the
 * git-committed value is then already a ready-to-use URL for any consumer
 * (`@contentrain/query`, raw markdown, a plain landing page) with no SDK.
 *
 * Only image/video/file fields (resolved via the model schema, including those
 * nested in object/array fields) and `media/...` src/href targets in
 * markdown/HTML are rewritten. External URLs (`http(s)://`, `//`, `data:`) and
 * already-absolute delivery URLs pass through untouched, so every entry point
 * is idempotent and safe to call repeatedly. In local mode (no base) media
 * stays a relative path — the OSS file model.
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
