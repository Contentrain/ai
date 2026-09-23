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
 * A plugin's unrendered template, in its own syntax: Yoast `%%title%%`,
 * SEOPress `%%post_title%%`, Rank Math `%title%` / `%customfield(name)%`,
 * AIOSEO `#post_title`. Printed as-is it would be a literal
 * `%%title%% %%sep%%` in the search result, so such a value is dropped and
 * the page's own falls in. AIOSEO's tags are matched by name, not as any
 * `#word`: a title can hold a hashtag.
 */
const TEMPLATE_RE: Record<SeoProvider, RegExp> = {
  yoast: /%%[a-z0-9_-]+%%/i,
  seopress: /%%[a-z0-9_-]+%%/i,
  rank_math: /%[a-z_]+(?:\([^)]*\))?%/i,
  aioseo: /#(?:(?:alt|archive|attachment|author|category|current|custom_field|page|parent|post|search|separator|site|tax|taxonomy)_[a-z0-9_-]+|categories|permalink|tagline)\b/i,
}

/**
 * Whether a string holds a template token. Percent-encoding is decoded first
 * when it decodes: `%E4%B8%AD` in a CJK URL is text, not Rank Math's `%AD%`.
 * A real token never decodes (`%ti…` is no escape), so it is tested as it is.
 */
function hasToken(value: string, template: RegExp): boolean {
  let decoded = value
  try {
    decoded = decodeURI(value)
  } catch {
    // Not decodable — as a template token is not: test the string itself.
  }
  return template.test(decoded)
}

const text = (value: string | undefined, template: RegExp | undefined): string | undefined => {
  const v = value?.trim()
  if (!v) return undefined
  return template && hasToken(v, template) ? undefined : v
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

/** Share-card values: the rendered ones, each missing one from the block. */
function merged(rendered: TwitterOverride | undefined, stored: TwitterOverride | undefined): TwitterOverride | undefined {
  if (!rendered) return stored
  if (!stored) return rendered
  return { ...stored, ...rendered }
}

/**
 * One page's SEO fields from the blocks each plugin holds for it. The serving
 * plugin's block wins; without one the first plugin (Yoast, Rank Math,
 * AIOSEO, SEOPress) that has data does. Its values are read, in order, from:
 *
 * 1. the block itself when the running plugin rendered it (`resolved`);
 * 2. `rendered` — the exporter's own rendering of the plugin's templates, for
 *    a plugin that is not the one serving the head. Final text: a variable it
 *    could not render is already out of the string, and only listed in
 *    `unresolved` for a person to read;
 * 3. the stored values, with the plugin's unrendered templates dropped.
 *
 * 2 and 3 are taken field by field: a value the rendering does not carry
 * falls back to the block's stored literal.
 *
 * Whatever the source, a string that still holds a template token in the
 * plugin's syntax is dropped: a token is never printed. The same holds for
 * the JSON-LD: a resolved block's graph is the plugin's rendering; any other
 * block's graph — the exporter's rendered nodes, else its own top-level graph
 * — is read node by node, and a node still holding a token is left out.
 *
 * Robots come from `robots_served` — what the page actually carried after
 * WordPress and the plugin reconciled their settings — then `rendered.robots`,
 * then the plugin's own `robots`.
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
  // A block the running plugin rendered is final text; anything else is
  // checked for its plugin's template tokens.
  const template = entry.resolved === true ? undefined : TEMPLATE_RE[provider]
  const rendered = entry.resolved === true ? undefined : entry.rendered
  const out: SeoFields = {}

  // Field by field: what the exporter rendered, else the block's own value —
  // a stored literal still counts where the rendering has nothing to say, and
  // a stored template is still dropped by `text`.
  const title = text(rendered?.title, template) ?? text(entry.title, template)
  if (title) out.seo_title = title
  const description = text(rendered?.description, template) ?? text(entry.description, template)
  if (description) out.description = description

  const canonical = (rendered?.canonical ?? entry.canonical)?.trim()
  if (canonical && !(options.url && addressKey(canonical) === addressKey(options.url))) out.canonical = canonical

  const served = entry.robots_served?.map((d) => d.trim().toLowerCase())
  const robots = rendered?.robots ?? entry.robots
  const noindex = served ? served.includes('noindex') : robots?.index === 'noindex'
  const nofollow = served ? served.includes('nofollow') : robots?.follow === 'nofollow'
  if (noindex) out.noindex = true
  if (nofollow) out.nofollow = true

  const og = merged(social(rendered?.open_graph, template), social(entry.open_graph, template))
  if (og) out.open_graph = og
  // The card is a setting, not rendered text: it comes from the block.
  const tw = merged(social(rendered?.twitter, template), social(entry.twitter, template))
  if (tw) out.twitter = tw

  // The plugin's rendered graph; else the stored schema nodes the exporter
  // rendered (Rank Math), as a graph of their own.
  // JSON-LD: the graph the running plugin rendered, from a resolved block
  // only. Otherwise a block's top-level graph may be the stored nodes, still
  // holding templates, so the exporter's rendering is read instead — node by
  // node, and a node that still holds a template token is left out.
  if (entry.resolved === true) {
    const graph = entry.schema?.graph
    if (graph && typeof graph === 'object') out.schema = graph
  } else if (template) {
    // The rendering; without one, the block's own graph — both node by node.
    const top = entry.schema?.graph
    const source = Array.isArray(rendered?.schema?.graph)
      ? rendered.schema.graph
      : ldNodes(top)
    const nodes = source.filter((node) => !holdsToken(node, template))
    if (nodes.length) out.schema = { '@context': 'https://schema.org', '@graph': nodes }
  }
  return out
}

/** A JSON-LD value's nodes: a @graph object's graph, a node array, or one node. */
function ldNodes(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value
  const graph = (value as { '@graph'?: unknown })['@graph']
  return Array.isArray(graph) ? graph : [value]
}

/** Whether any string anywhere in a JSON value holds a template token. */
function holdsToken(value: unknown, template: RegExp): boolean {
  if (typeof value === 'string') return hasToken(value, template)
  if (Array.isArray(value)) return value.some((v) => holdsToken(v, template))
  if (value && typeof value === 'object') return Object.values(value).some((v) => holdsToken(v, template))
  return false
}
