// A page's SEO as the source's plugin held it (`RawSeo.entries[address]`,
// what the WordPress Bridge exports) → the fields an `EmitPost` / `QueryPage`
// carries. The emitter renders; choosing among plugins and reading their
// output is done here once, so every producer reading a Bridge export maps it
// the same way.

import type { RawSeoEntry, SeoProvider } from '@contentrain/types'
import { SEO_PROVIDERS } from '@contentrain/types'
import type { SocialOverride, TwitterOverride } from './types.js'

/** The SEO fields of one page, ready to spread into an `EmitPost` or `QueryPage`. */
export interface SeoFields {
  /** For an `EmitPost`; a `QueryPage`'s `title` is already its document title. */
  seo_title?: string
  description?: string
  canonical?: string
  /** Kept out of search. */
  noindex?: boolean
  nofollow?: boolean
  open_graph?: SocialOverride
  twitter?: TwitterOverride
  schema?: unknown
}

export interface SeoFromRawOptions {
  /** The plugin the live site's head came from (`RawSeo.serving`). Its block is read first. */
  serving?: SeoProvider | 'wordpress-core'
  /**
   * The page's own absolute address. A canonical equal to it is left out — the
   * Seo component already points a page at itself — so only a canonical that
   * sends the page somewhere else becomes an override.
   */
  url?: string
}

/**
 * A plugin's unrendered template, in its own syntax: Yoast \`%%title%%\`,
 * Rank Math \`%title%\` / \`%customfield(name)%\`, AIOSEO \`#post_title\`.
 * Printed as-is it would be a literal \`%%title%% %%sep%%\` in the search
 * result, so such a value is dropped and the page's own falls in. AIOSEO's
 * tags are matched by name, not as any \`#word\`: a title can hold a hashtag.
 */
const TEMPLATE_RE: Record<SeoProvider, RegExp> = {
  yoast: /%%[a-z0-9_-]+%%/i,
  rank_math: /%[a-z_]+(?:\([^)]*\))?%/i,
  aioseo: /#(?:(?:alt|archive|attachment|author|category|current|custom_field|page|parent|post|search|separator|site|tax|taxonomy)_[a-z0-9_-]+|categories|permalink|tagline)\b/i,
}

const text = (value: string | undefined, template: RegExp | undefined): string | undefined => {
  const v = value?.trim()
  if (!v) return undefined
  return template?.test(v) ? undefined : v
}

const addressKey = (url: string): string => url.trim().replace(/^https?:\/\//i, '//').replace(/\/+(?=[?#]|$)/, '')

function social(value: TwitterOverride | undefined, template: RegExp | undefined): TwitterOverride | undefined {
  if (!value) return undefined
  const out: TwitterOverride = {}
  const title = text(value.title, template)
  const description = text(value.description, template)
  const image = value.image?.trim()
  const card = value.card?.trim()
  if (title) out.title = title
  if (description) out.description = description
  if (image) out.image = image
  if (card) out.card = card
  return Object.keys(out).length ? out : undefined
}

/**
 * One page's SEO fields from the blocks each plugin holds for it. The serving
 * plugin's block wins; without one the first plugin (Yoast, Rank Math, AIOSEO)
 * that has data does. A block not marked `resolved` holds stored values and
 * templates, so its template strings — in that plugin's syntax — are dropped
 * and its literal values kept.
 *
 * Robots come from `robots_served` — what the page actually carried after
 * WordPress and the plugin reconciled their settings — and from the plugin's
 * own `robots` only when that is missing.
 */
export function seoFromRawEntry(
  blocks: Partial<Record<SeoProvider, RawSeoEntry>> | undefined,
  options: SeoFromRawOptions = {},
): SeoFields {
  if (!blocks) return {}
  const order = [
    ...(options.serving && options.serving !== 'wordpress-core' ? [options.serving] : []),
    ...SEO_PROVIDERS,
  ]
  const provider = order.find((p) => blocks[p] !== undefined)
  if (!provider) return {}
  const entry = blocks[provider]!
  // A rendered block holds final text; a stored one may hold templates.
  const template = entry.resolved === true ? undefined : TEMPLATE_RE[provider]
  const out: SeoFields = {}

  const title = text(entry.title, template)
  if (title) out.seo_title = title
  const description = text(entry.description, template)
  if (description) out.description = description

  const canonical = entry.canonical?.trim()
  if (canonical && !(options.url && addressKey(canonical) === addressKey(options.url))) out.canonical = canonical

  const served = entry.robots_served?.map((d) => d.trim().toLowerCase())
  const noindex = served ? served.includes('noindex') : entry.robots?.index === 'noindex'
  const nofollow = served ? served.includes('nofollow') : entry.robots?.follow === 'nofollow'
  if (noindex) out.noindex = true
  if (nofollow) out.nofollow = true

  const og = social(entry.open_graph, template)
  if (og) out.open_graph = og
  const tw = social(entry.twitter, template)
  if (tw) out.twitter = tw

  const graph = entry.schema?.graph
  if (graph && typeof graph === 'object') out.schema = graph
  return out
}
