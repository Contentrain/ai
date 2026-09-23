// Project scaffolding: manifest, config, styles, and the shared fill helper
// the generated pages use to pour content into `@@mark@@` placeholders.

import type { DesignTokens, ProjectIR } from '@contentrain/types'
import type { EmitOptions, RuntimeBinding } from './types.js'
import { DEFAULT_IMAGE_SIZES, DEFAULT_IMAGE_WIDTHS, IMAGES_TS, astroImageConfig, imagePatterns, imagesEnabled, optimizeImagesTs } from './images.js'
import { stableJson } from './util.js'
import { sitemapFilterDeclarations, sitemapIntegration } from './noindex.js'

/**
 * `noindex` holds the site-root paths the sitemap leaves out (see noindex.ts);
 * `redirectsConfig` is the `redirects` block for astro.config.mjs (see redirects.ts);
 * `runtime` adds its host to the image allow-list (see images.ts).
 */
export function scaffoldFiles(ir: ProjectIR, options: EmitOptions, noindex: string[] = [], redirectsConfig: string | null = null, runtime?: RuntimeBinding): Record<string, string> {
  const tailwind = options.tailwind !== false
  const split = ir.viewport_strategy === 'split'
  // The sitemap integration needs an absolute site to build URLs from; without
  // one it has nothing to write, so it is only wired when there is a site.
  const sitemap = options.sitemap !== false && Boolean(ir.site.url)
  const images = imagesEnabled(options)
  const imageConfig = images ? astroImageConfig(imagePatterns(options, runtime)) : null
  const files: Record<string, string> = {}

  const pkg: Record<string, unknown> = {
    name: options.projectName ?? 'migrated-site',
    private: true,
    type: 'module',
    scripts: {
      dev: 'astro dev',
      // `astro check` first: type errors in generated pages should fail the
      // build, not surface later in a browser.
      build: 'astro check && astro build',
      preview: 'astro preview',
      // Split viewport production (skeleton): one build per device class, served by device.
      ...(split ? { 'build:desktop': 'VIEWPORT=desktop astro build --outDir dist/desktop', 'build:mobile': 'VIEWPORT=mobile astro build --outDir dist/mobile' } : {}),
    },
    dependencies: {
      astro: '^5.0.0',
      ...(tailwind ? { tailwindcss: '^4.0.0', '@tailwindcss/vite': '^4.0.0' } : {}),
      ...(sitemap ? { '@astrojs/sitemap': '^3.7.0' } : {}),
      // Astro's default image service; getImage() needs it at build time.
      ...(images ? { sharp: '^0.34.0' } : {}),
    },
    devDependencies: {
      '@astrojs/check': '^0.9.0',
      typescript: '^5.7.0',
    },
  }
  files['package.json'] = stableJson(pkg)

  files['astro.config.mjs'] = [
    `import { defineConfig } from 'astro/config'`,
    ...(tailwind ? [`import tailwindcss from '@tailwindcss/vite'`] : []),
    ...(sitemap ? [`import sitemap from '@astrojs/sitemap'`] : []),
    ``,
    ...(sitemap ? sitemapFilterDeclarations(noindex) : []),
    `export default defineConfig({`,
    // Canonical URLs and sitemaps hang off \`site\` — for a migration, SEO
    // continuity is the point, so the source site's URL always lands here.
    // Astro rejects an empty string as an invalid URL and refuses to build, so
    // with no site the key is left out; the emitter warns about that instead.
    ...(ir.site.url ? [`  site: ${JSON.stringify(ir.site.url)},`] : []),
    `  build: { format: 'directory' },`,
    ...(redirectsConfig ? [redirectsConfig] : []),
    ...(sitemap ? [`  integrations: [${sitemapIntegration(noindex)}],`] : []),
    // Hosts content images may be optimized from — the same list the emitted
    // src/lib/optimize-images.ts checks before calling getImage().
    ...(imageConfig ? [imageConfig] : []),
    ...(tailwind ? [`  vite: { plugins: [tailwindcss()] },`] : []),
    `})`,
    ``,
  ].join('\n')

  // Astro wants a tsconfig in every project — editors and the compiler read
  // it even in JS-only projects, and the emitted src/lib/fill.ts is TS.
  files['tsconfig.json'] = `${JSON.stringify({ extends: 'astro/tsconfigs/base', include: ['.astro/types.d.ts', '**/*'], exclude: ['dist', 'public', 'node_modules'] }, null, 2)}\n`

  if (tailwind) files['src/styles/modern.css'] = modernCss(ir.tokens)

  if (options.sitemap !== false) files['public/robots.txt'] = robotsTxt(ir.site.url)

  files['src/lib/fill.ts'] = FILL_TS
  if (images) {
    files['src/lib/images.ts'] = IMAGES_TS
    files['src/lib/optimize-images.ts'] = optimizeImagesTs(
      imagePatterns(options, runtime),
      options.images?.widths ?? DEFAULT_IMAGE_WIDTHS,
      options.images?.sizes ?? DEFAULT_IMAGE_SIZES,
    )
  }
  return files
}

/**
 * `robots.txt` allowing crawlers and naming the sitemap.
 *
 * The `Sitemap:` line must be an absolute URL — a relative one is invalid and
 * crawlers ignore it. Without a site to make it absolute the line is left out
 * rather than pointed at a build host; the emitter warns about the missing site
 * separately.
 *
 * Nothing is disallowed. A WordPress robots.txt typically keeps crawlers out of
 * `/wp-admin/`; the migrated site has no such path, so carrying the rule over
 * would only restrict a site that no longer needs restricting.
 *
 * The sitemap is resolved under the site's own path, not the host root: a site
 * at `https://example.com/blog` serves its build output, sitemap included, under
 * `/blog/`.
 */
export function robotsTxt(siteUrl: string | undefined): string {
  const lines = ['User-agent: *', 'Allow: /']
  if (siteUrl) {
    const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`
    lines.push('', `Sitemap: ${new URL('sitemap-index.xml', base).href}`)
  }
  return `${lines.join('\n')}\n`
}

/** Tailwind 4 evolution layer: CSS-first config with the site's extracted tokens. */
function modernCss(tokens: DesignTokens | undefined): string {
  const lines: string[] = [`@import 'tailwindcss';`, ``]
  const theme: string[] = []
  const push = (prefix: string, map: Record<string, string> | undefined) => {
    for (const [key, value] of Object.entries(map ?? {})) theme.push(`  --${prefix}-${key}: ${value};`)
  }
  push('color', tokens?.colors)
  push('font', tokens?.font_families)
  push('text', tokens?.font_sizes)
  push('spacing', tokens?.spacing)
  push('breakpoint', tokens?.breakpoints)
  if (theme.length) lines.push(`@theme {`, ...theme, `}`)
  return `${lines.join('\n')}\n`
}

const FILL_TS = `// Emitted by @contentrain/emitter-astro — the template runtime.
//
// Chrome, item templates and attribute values carry three marker forms:
//   @@mark@@                                       — a value, escaped
//   @@mark_html@@                                  — a value, raw HTML
//   <!--@@repeat:list@@-->…<!--@@/repeat@@-->      — once per list item
//   <!--@@if:name@@-->…<!--@@/if@@-->              — only when name has a value
// Rendering order is repeats → conditionals → marks, so a repeat body may hold
// conditionals and marks that only make sense per item.

/** Where page content splices into the body chrome — must match @contentrain/types CHROME_BODY_SLOT. */
export const BODY_SLOT = '<!--@@body@@-->'

const REPEAT_RE = /<!--@@repeat:([a-z0-9_]+)(?:\\|([\\s\\S]*?))?@@-->([\\s\\S]*?)<!--@@\\/repeat@@-->/gi
const IF_RE = /<!--@@if:(!?)([a-z0-9_]+)@@-->([\\s\\S]*?)<!--@@\\/if@@-->/gi
const MARK_RE = /@@([a-z0-9_]+)@@/gi

export type Values = Record<string, unknown>

export const esc = (value: unknown): string =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const isFilled = (value: unknown): boolean =>
  Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ''

/**
 * Replace @@marks@@. Values are escaped unless the mark name ends in _html —
 * escaping is the default so content-derived text can never break the page,
 * and the _html opt-in exists for themes that print a post's own markup
 * (full content in a list card, a link-bearing excerpt).
 */
export function fillMarks(html: string, values: Values): string {
  return html.replace(MARK_RE, (_all, key: string) => {
    const value = values[key]
    if (Array.isArray(value)) return value.map((v) => esc(v && typeof v === 'object' && 'name' in v ? (v as { name: unknown }).name : v)).join(', ')
    return key.toLowerCase().endsWith('_html') ? String(value ?? '') : esc(value ?? '')
  })
}

/** Expand repeat blocks; each item renders the inner fragment with its own values. */
export function expandRepeats(html: string, values: Values): string {
  return html.replace(REPEAT_RE, (_all, name: string, sep: string | undefined, inner: string) => {
    const list = values[name]
    if (!Array.isArray(list) || list.length === 0) return ''
    return list
      .map((item, index) => {
        // An object item prints its name at @@item@@ and exposes item_<key> for
        // the rest, so a template written for string terms keeps working when
        // the producer starts sending { name, link }.
        const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : undefined
        const itemValues: Values = { ...values, item: record && 'name' in record ? record.name : item, item_index: String(index) }
        if (record) {
          for (const [k, v] of Object.entries(record)) itemValues['item_' + k] = v
        }
        return renderTemplate(inner, itemValues)
      })
      .join(sep ?? '')
  })
}

/** Drop conditional blocks whose value is empty (or present, when negated). */
export function applyConditions(html: string, values: Values): string {
  return html.replace(IF_RE, (_all, negate: string, name: string, inner: string) =>
    isFilled(values[name]) !== (negate === '!') ? inner : '',
  )
}

/** Full render: repeats → conditionals → marks. */
export function renderTemplate(html: string, values: Values): string {
  return fillMarks(applyConditions(expandRepeats(html, values), values), values)
}

/** Fill marks inside attribute values (per-page classes like postid-123). */
export function fillAttrs(attrs: Record<string, string> | undefined, values: Values): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(attrs ?? {})) out[name] = fillMarks(value, values)
  return out
}

/**
 * Compose the body chrome with the page content. The split happens BEFORE any
 * rendering: the @@…@@ pattern would otherwise consume the @@body@@ inside the
 * marker comment, leaving <!----> behind and silently dropping the content
 * (measured cost on a real page: 49.8 vs 97.8).
 */
export function composeBody(chromeBody: string, values: Values, content: string): string {
  return chromeBody
    .split(BODY_SLOT)
    .map((part) => renderTemplate(part, values))
    .join(content)
}

/** Component mount marker — must match @contentrain/types CHROME_COMPONENT_OPEN / CHROME_COMPONENT_CLOSE. */
export const COMPONENT_OPEN = '<!--@@component:'
export const COMPONENT_CLOSE = '@@-->'
const COMPONENT_RE = /<!--@@component:([^@\\s]+)@@-->/g

export interface BodyPart {
  html: string
  /** A mount point: the component id the marker named. */
  component?: string
}

/**
 * Split rendered chrome at component markers into html parts interleaved with
 * mount points, so the layout can render a real component where the theme's
 * comments form (or contact form) stood. The parts are output in order, so the
 * page's HTML is exactly the chrome with the component's markup at the marker —
 * no parser sees the pieces separately.
 */
export function splitComponents(html: string): BodyPart[] {
  const parts: BodyPart[] = []
  let last = 0
  for (const match of html.matchAll(COMPONENT_RE)) {
    parts.push({ html: html.slice(last, match.index) })
    parts.push({ html: '', component: match[1] ?? '' })
    last = match.index + match[0].length
  }
  parts.push({ html: html.slice(last) })
  return parts
}

/** Where a list section's wrapper takes its items — must match @contentrain/types LIST_ITEMS_SLOT. */
export const ITEMS_SLOT = '<!--@@items@@-->'

export interface ListSection {
  template: string
  wrapper?: string
  count?: number
}

/**
 * Render a list in sections. Themes often render the newest post as a big card
 * and the rest as a grid — two templates in two containers — so a list is a
 * sequence of sections, each taking a count of items (or the remainder).
 */
export function renderSections<T>(
  sections: ListSection[],
  items: T[],
  values: (item: T) => Values,
): string {
  let index = 0
  const out: string[] = []
  for (const section of sections) {
    const take = section.count ?? items.length - index
    const slice = items.slice(index, index + take)
    index += slice.length
    if (slice.length === 0) continue
    const rendered = slice.map((item) => renderTemplate(section.template, values(item))).join('')
    out.push(section.wrapper ? section.wrapper.split(ITEMS_SLOT).join(rendered) : rendered)
  }
  return out.join('')
}

/**
 * Render a query's results for a region inside a page — a "recent posts" block
 * in an article's chrome, not a list page.
 *
 * A list PAGE maps each result set to a route, so several are expected. A
 * region has no route to distinguish them, so exactly one is expected and
 * anything else is a build error rather than a guess: picking the first would
 * silently render one category's posts under every category.
 *
 * Without item markup the region gets the same plain list a list page does,
 * and the emitter has warned. An empty string here was a region that vanished
 * from every page with nothing anywhere saying so.
 */
export function renderQuery(pages: EmittedQueryPage[], id: string): string {
  if (pages.length !== 1) {
    throw new Error(
      'Query "' + id + '" fills a page region, so it must have exactly one result set; got '
      + pages.length + '. A region has no route parameter to choose between them.',
    )
  }
  return renderQueryPage(pages[0]!)
}

/**
 * One result set as markup: its sections, its single item template, or — when
 * the producer supplied neither — a plain list of links. The plain list is not
 * fidelity and the emitter warns wherever it will be used; it exists so the
 * items are still there, because a list that renders nothing looks like a list
 * with no posts.
 */
export function renderQueryPage(page: EmittedQueryPage): string {
  const sections = page.sections?.length ? page.sections : page.item_template ? [{ template: page.item_template }] : []
  if (sections.length) return renderSections(sections, page.items, postMarks)
  return '<ul class="cr-post-list">'
    + page.items.map((item) => '<li><a href="/' + item.slug + '/">' + esc(item.title) + '</a></li>').join('')
    + '</ul>'
}

// ─── SEO helpers ───

/**
 * A meta description from free text: markup stripped, whitespace collapsed,
 * cut at a word boundary. The cap is a rendering limit, not an editorial
 * choice — an excerpt is a paragraph and a description tag is a line.
 */
export function seoDescription(text: string | undefined, max = 300): string | undefined {
  if (!text) return undefined
  const flat = text.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim()
  if (!flat) return undefined
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const space = cut.lastIndexOf(' ')
  // Concatenation, not a template literal: this file is emitted from one, and
  // an unescaped interpolation would be evaluated at emit time.
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…'
}

/**
 * Absolute URL for a social tag or a canonical link. Crawlers do not resolve
 * relative og:image or og:url, so a value that cannot be made absolute is
 * dropped rather than emitted half-formed. Needs \`site\` in astro.config.mjs.
 */
export function absoluteUrl(value: string | undefined, site: URL | undefined): string | undefined {
  if (!value) return undefined
  if (/^https?:\\/\\//i.test(value)) return value
  if (!site) return undefined
  try {
    return new URL(value, site).toString()
  } catch {
    return undefined
  }
}

export interface ImageMeta {
  width?: number
  height?: number
  type?: string
}

/**
 * The \`og:image:*\` values worth printing. A width that is not a positive
 * integer, or a type that is not an image MIME type, would be a wrong tag
 * rather than a missing one, so it is dropped.
 */
export function imageMetaTags(meta: ImageMeta | undefined): { width?: string; height?: string; type?: string } {
  const size = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n > 0 ? String(n) : undefined)
  const type = typeof meta?.type === 'string' && /^image\\/[a-z0-9.+-]+$/i.test(meta.type) ? meta.type.toLowerCase() : undefined
  return { width: size(meta?.width), height: size(meta?.height), type }
}

/**
 * JSON-LD payload for a \`<script type="application/ld+json">\`. \`<\` is escaped
 * so a value containing \`</script>\` cannot close the block and inject markup.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\\\u003c')
}

export interface Breadcrumb {
  name: string
  path: string
}

/**
 * A trail every crumb of which can be printed, or undefined. A crumb needs a
 * name and a site-root-relative path; one bad crumb drops the trail, because a
 * breadcrumb with a hole in it states a hierarchy the site does not have.
 */
export function validTrail(trail: unknown): Breadcrumb[] | undefined {
  if (!Array.isArray(trail) || !trail.length) return undefined
  const ok = trail.every((c) => c && typeof c === 'object'
    && typeof (c as Breadcrumb).name === 'string' && (c as Breadcrumb).name.trim() !== ''
    && typeof (c as Breadcrumb).path === 'string'
    && !(c as Breadcrumb).path.includes(String.fromCharCode(92))
    && ![...(c as Breadcrumb).path].some((char) => char.charCodeAt(0) <= 32) && /^\\/(?!\\/)/.test((c as Breadcrumb).path))
  return ok ? (trail as Breadcrumb[]) : undefined
}

export interface PageStructuredDataInput {
  url?: string
  site?: URL
  /** The document title: the page node's name. */
  title: string
  /** The entry's own title, when \`title\` is one an SEO plugin composed: Article headline, last crumb. */
  headline?: string
  description?: string
  image?: string
  locale?: string
  article: boolean
  pageType?: 'WebPage' | 'CollectionPage'
  publishedAt?: string
  modifiedAt?: string
  author?: string
  siteName?: string
  /** \`@id\` of the site's own WebSite node, when its head declares one. */
  websiteId?: string
  breadcrumbs?: Breadcrumb[]
}

/**
 * The page's structured data as one graph: the page itself (WebPage, or
 * CollectionPage for a list), its breadcrumb trail, and on an entry the
 * Article whose main entity it is — linked by \`@id\` rather than repeated.
 *
 * The page node needs an absolute address to be anything; without \`site\`
 * only an entry's Article remains, as before. \`isPartOf\` points at the site's
 * own WebSite node when the kept head declares one — never at a WebSite this
 * function invents.
 */
export function pageStructuredData(input: PageStructuredDataInput): Record<string, unknown> | undefined {
  const graph: Array<Record<string, unknown>> = []
  const { url } = input
  const trail = url ? validTrail(input.breadcrumbs) : undefined
  const crumbs = trail
    ? trail.map((c) => ({ name: c.name, item: absoluteUrl(c.path, input.site) }))
    : []
  const breadcrumbId = url && trail && crumbs.every((c) => c.item) ? url + '#breadcrumb' : undefined
  if (url) {
    graph.push({
      '@type': input.pageType ?? 'WebPage',
      '@id': url,
      url,
      ...(input.title ? { name: input.title } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.locale ? { inLanguage: input.locale } : {}),
      ...(input.websiteId ? { isPartOf: { '@id': input.websiteId } } : {}),
      ...(breadcrumbId ? { breadcrumb: { '@id': breadcrumbId } } : {}),
    })
  }
  if (breadcrumbId) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: [...crumbs, { name: input.headline ?? input.title, item: url }].map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    })
  }
  if (input.article) {
    graph.push({
      '@type': 'Article',
      headline: input.headline ?? input.title,
      ...(input.description ? { description: input.description } : {}),
      ...(input.image ? { image: [input.image] } : {}),
      ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
      ...(input.modifiedAt ? { dateModified: input.modifiedAt } : {}),
      ...(input.author ? { author: { '@type': 'Person', name: input.author } } : {}),
      ...(url ? { mainEntityOfPage: { '@id': url } } : {}),
      ...(input.siteName ? { publisher: { '@type': 'Organization', name: input.siteName } } : {}),
    })
  }
  return graph.length ? { '@context': 'https://schema.org', '@graph': graph } : undefined
}

const SITE_SEARCH = 'SearchAction'

/**
 * An \`@id\` compared as an address: the scheme, the host's case and a slash
 * before the fragment are not part of it, so \`https://a.com/#website\` and
 * \`http://A.com#website\` name one node — the head and a page's graph can
 * each have been rewritten to the new origin in their own way.
 */
const ldIdKey = (id: string): string => id.trim()
  .replace(/^(?:https?:)?\\/\\/[^/?#]*/i, (origin) => origin.toLowerCase().replace(/^https?:/, ''))
  .replace(/\\/+(?=#|$)/, '')

/**
 * The page's structured data as the source's SEO plugin rendered it, ready to
 * print — or undefined, and the generated graph is used. What the plugin
 * described is kept as it was (FAQ, HowTo, Product, its WebPage and Article)
 * except a WebSite's SearchAction, which would be false on the migrated site
 * (a static site has no ?s= search), and the nodes the kept head already
 * carries (\`headIds\` — WebSite, Organization, its logo), which every page
 * would otherwise print twice.
 */
export function sourceStructuredData(schema: unknown, headIds: string[] = []): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== 'object') return undefined
  const root = schema as Record<string, unknown>
  const graph = root['@graph']
  const nodes: unknown[] = Array.isArray(schema) ? schema : Array.isArray(graph) ? graph : [schema]
  const typesOf = (node: Record<string, unknown>): string[] =>
    (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).filter((t): t is string => typeof t === 'string')
  const inHead = new Set(headIds.map(ldIdKey))
  const kept: Array<Record<string, unknown>> = []
  for (const value of nodes) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    let node = value as Record<string, unknown>
    if (!typesOf(node).length) continue
    const website = typesOf(node).some((t) => t.toLowerCase() === 'website')
    if (typeof node['@id'] === 'string' && inHead.has(ldIdKey(node['@id']))) continue
    if (website && node['potentialAction'] !== undefined) {
      const action = node['potentialAction']
      const actions = (Array.isArray(action) ? action : [action]).filter((a) =>
        !(a && typeof a === 'object' && typesOf(a as Record<string, unknown>).includes(SITE_SEARCH)))
      const { potentialAction: _, ...rest } = node
      node = actions.length ? { ...rest, potentialAction: Array.isArray(action) ? actions : actions[0] } : rest
    }
    kept.push(node)
  }
  if (!kept.length) return undefined
  const context = Array.isArray(schema) ? undefined : root['@context']
  return { '@context': context ?? 'https://schema.org', '@graph': kept }
}

/** Emitted stylesheets live under /styles/legacy/ — pages reference them by file name. */
export const cssHref = (file: string): string => '/styles/legacy/' + (file.split('/').pop() ?? file)

/** A term as a list card prints it: name, and the archive it links to. */
export interface TermRef {
  name: string
  link?: string
}

/** The display name of a term given as a string or a TermRef. */
export const termName = (term: string | TermRef): string => (typeof term === 'string' ? term : term.name)

export interface MarkablePost {
  slug: string
  title: string
  body?: string
  dates?: string[]
  author?: string
  author_first?: string
  author_last?: string
  authors?: string[]
  /**
   * Strings, or objects for themes whose term lists link each term
   * (\`<!--@@repeat:terms@@-->\` with \`item_name\` / \`item_link\`). The
   * \`term{n}\` and \`terms\` marks print the name either way.
   */
  terms?: Array<string | TermRef>
  featured?: string[]
  excerpt?: string
  excerpt_html?: string
  marks?: Record<string, unknown>
}

/**
 * The mark vocabulary: title, author (+ first/last), date{n}, term{n}, feat{n},
 * excerpt, slug — plus \`terms\`/\`authors\` as LISTS for repeat blocks, the
 * _html variants for raw insertion, and any producer-supplied extras.
 */
export function postMarks(post: MarkablePost): Values {
  const values: Values = {
    title: post.title,
    author: post.author ?? '',
    author_first: post.author_first ?? '',
    author_last: post.author_last ?? '',
    excerpt: post.excerpt ?? '',
    excerpt_html: post.excerpt_html ?? post.excerpt ?? '',
    body_html: post.body ?? '',
    slug: post.slug,
    feat: post.featured?.[0] ?? '',
    // Objects stay objects for repeat blocks (item_name / item_link); the joined
    // \`terms\` mark prints names, so fillMarks never sees [object Object].
    terms: (post.terms ?? []).map((t) => (typeof t === 'string' ? { name: t, link: '' } : { name: t.name, link: t.link ?? '' })),
    terms_names: (post.terms ?? []).map(termName),
    authors: post.authors ?? (post.author ? [post.author] : []),
  }
  for (const [i, d] of (post.dates ?? []).entries()) values['date' + i] = d
  for (const [i, t] of (post.terms ?? []).entries()) values['term' + i] = termName(t)
  for (const [i, f] of (post.featured ?? []).entries()) values['feat' + i] = f
  return { ...values, ...(post.marks ?? {}) }
}

/**
 * The shapes of the emitted data files. Pages import JSON and assert these
 * rather than letting TypeScript infer the shape from the file's contents:
 * inference reads only the fields the data HAPPENS to carry, so a site whose
 * posts need no extra route parameters produced a type without \`params\` and
 * \`astro check\` — which the build runs first — failed on the page that reads
 * it. The contract is what the emitter may write, not what one site wrote.
 */
/** Content-store address of an entry — what a mounted comments component keys its thread by. */
export interface EntryRef {
  model_id: string
  entry_id: string
  locale?: string
}

/** Share-card values a page's source set by hand; each one left out is derived. */
export interface SocialOverride {
  title?: string
  description?: string
  image?: string
}

export interface TwitterOverride extends SocialOverride {
  card?: string
}

export interface SeoInput {
  title?: string
  headline?: string
  description?: string
  canonical?: string
  image?: string
  imageMeta?: ImageMeta
  alternates?: Array<{ lang: string; path: string }>
  breadcrumbs?: Breadcrumb[]
  pageType?: 'WebPage' | 'CollectionPage'
  type?: 'article' | 'website'
  publishedAt?: string
  modifiedAt?: string
  author?: string
  noindex?: boolean
  nofollow?: boolean
  openGraph?: SocialOverride
  twitter?: TwitterOverride
  schema?: unknown
}

/**
 * The SEO of one entry page. \`featured\` holds bare file names — only the
 * producer knows where media is served from — so an image is taken from it
 * only when it already reads as a path; otherwise \`image\` supplies it and
 * the tag is omitted rather than pointing at a URL that does not resolve.
 */
export function postSeo(post: EmittedPost): SeoInput {
  const featured = (post.featured ?? []).find((f) => f.startsWith('/') || /^https?:/i.test(f))
  return {
    // The document title an SEO plugin composed; the entry's own name stays the headline.
    title: post.seo_title || post.title,
    headline: post.title,
    description: post.description ?? post.excerpt,
    canonical: post.canonical,
    image: post.image ?? featured,
    // The measurements describe \`image\`; a \`featured\` fallback is another file.
    imageMeta: post.image ? post.image_meta : undefined,
    alternates: post.alternates,
    breadcrumbs: post.breadcrumbs,
    type: 'article',
    publishedAt: post.published_at,
    modifiedAt: post.modified_at,
    author: post.author,
    noindex: post.noindex,
    nofollow: post.nofollow,
    openGraph: post.open_graph,
    twitter: post.twitter,
    schema: post.schema,
  }
}

export interface EmittedPost extends MarkablePost {
  body: string
  /** Meta description; falls back to the excerpt. */
  description?: string
  /** Social image, absolute or site-root-relative. */
  image?: string
  image_meta?: ImageMeta
  /** Translations of this entry, itself included, and x-default. Computed by the emitter. */
  alternates?: Array<{ lang: string; path: string }>
  /** Trail to this page, itself excluded. */
  breadcrumbs?: Breadcrumb[]
  /** Canonical override; default is the page's own address. */
  canonical?: string
  /** Document title, when the source composed one apart from \`title\`. */
  seo_title?: string
  open_graph?: SocialOverride
  twitter?: TwitterOverride
  /** The source SEO plugin's JSON-LD for this page. */
  schema?: unknown
  /** ISO 8601, for Article structured data. */
  published_at?: string
  modified_at?: string
  /** Route parameters beyond slug — the date parts of a dated permalink, a post id. */
  params?: Record<string, string>
  /** Stylesheets only this page loads. */
  css?: string[]
  locale?: string
  /** Present when the producer bound this post to the content store. */
  entry?: EntryRef
  /** Kept out of search: robots meta, and no sitemap entry. */
  noindex?: boolean
  nofollow?: boolean
}

/** One static path of a list route, as it appears in the emitted query data. */
export interface EmittedQueryPage {
  params: Record<string, string>
  items: EmittedPost[]
  marks?: Record<string, unknown>
  css?: string[]
  item_template?: string
  sections?: ListSection[]
  title?: string
  description?: string
  image?: string
  image_meta?: ImageMeta
  canonical?: string
  breadcrumbs?: Breadcrumb[]
  noindex?: boolean
  nofollow?: boolean
  open_graph?: SocialOverride
  twitter?: TwitterOverride
  schema?: unknown
}
`
