// Shared conversion helpers, ported from the measured induction core.
// The identity formulas here are load-bearing: hexId('posts:' + slug) must
// produce the same entry id whether the site arrived via WXR or REST, or a
// later delta import would duplicate every entry.

import { createHash } from 'node:crypto'
import type { FieldDef } from '@contentrain/types'

export const norm = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim()

export const strip = (s: unknown): string =>
  norm(
    String(s ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&amp;/g, '&'),
  )

/** Entry id: deterministic hex from a stable key (model:slug style). */
export const hexId = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 24)

const sortDeep = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sortDeep)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .toSorted()
            .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
        )
      : v

/** Canonical serialization: sorted keys, 2-space indent, trailing newline. */
export const canon = (o: unknown): string => `${JSON.stringify(sortDeep(o), null, 2)}\n`

/** Field-type inference from a value (open meta / ACF fields). */
export const byValue = (v: unknown): string | null => {
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'decimal'
  if (Array.isArray(v)) return 'array'
  if (v && typeof v === 'object') return 'object'
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/^https?:\/\/\S+\.(mp3|m4a|wav|pdf|zip|docx?)(\?|$)/i.test(s)) return 'file'
  if (/^https?:\/\/\S+\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(s)) return 'image'
  if (/^https?:\/\//.test(s)) return 'url'
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return 'email'
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(s)) return 'datetime'
  if (/<[a-z][\s\S]*>/i.test(s)) return 'richtext'
  return s.length > 200 ? 'text' : 'string'
}

/** WP post types that never become content models. */
export const SKIP_TYPES =
  /^(attachment|nav_menu_item|wp_|jp_|pattern|revision|oembed_cache|customize_changeset|user_request|custom_css)/

/** Open meta keys that are plugin plumbing, not editorial fields. */
export const PLUGIN_META = /^(jetpack|wpdc|discourse|footnotes|inline_featured|spay_|advanced_seo|rank_math|yoast)/i

/** WP core/plumbing meta keys (never editorial). */
export const CORE_META =
  /^(_edit_last|_edit_lock|_thumbnail_id|_wp_page_template|_wp_old_slug|_wp_attached_file|_wp_attachment_metadata|_wp_attachment_image_alt|_wp_attachment_backup_sizes|_wp_desired_post_slug|_wp_trash_meta_.*|_menu_item_.*|_oembed_.*|_publicize_.*|_wpas_.*|_pingme|_encloseme|enclosure|_last_editor_used_jetpack|_rest_api_.*|_wp_attachment_context|_wp_attachment_is_custom_header|_wp_attachment_is_custom_background|_customize_.*|_elementor_.*|_wpcom_.*|_wp_suggested_privacy_policy_content|geo_.*|_jetpack_.*|_links_to.*|_format_.*)$/

/** Taxonomy → model id. */
export const taxModelId = (t: string): string =>
  t === 'post_tag' ? 'tags' : t === 'category' ? 'categories' : t.replace(/_/g, '-')

export const slugify = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const decodeSlug = (s: string): string => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** The measured core field skeleton for content models (same order/labels). */
export function coreFields(opts: {
  excerpt: boolean
  body: boolean
  date: boolean
  author: boolean
  taxes: string[]
  cover: boolean
}): { fields: Record<string, FieldDef>; order: number } {
  const fields: Record<string, FieldDef> = {
    title: { type: 'string', required: true, label: 'Title', order: 10 },
    slug: { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
  }
  let o = 30
  if (opts.excerpt) fields.excerpt = { type: 'text', label: 'Excerpt', order: (o += 10) }
  if (opts.body) fields.body = { type: 'richtext', label: 'Body', order: (o += 10) }
  if (opts.date) fields.published_at = { type: 'datetime', label: 'Published at', order: (o += 10) }
  if (opts.author) fields.author = { type: 'relation', model: 'authors', label: 'Author', order: (o += 10) }
  for (const t of opts.taxes) fields[taxModelId(t)] = { type: 'relations', model: taxModelId(t), label: t, order: (o += 10) }
  if (opts.cover) fields.cover = { type: 'relation', model: 'media', label: 'Cover', order: (o += 10) }
  return { fields, order: o }
}
