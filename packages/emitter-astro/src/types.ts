import type { EntrySourceRef, ProjectIR, RuntimeBinding } from '@contentrain/types'

// ─── Emit input ───

/**
 * One piece of content ready to render: body already HTML, assets already
 * rewritten to local paths, dates already formatted in the site's observed
 * formats. The emitter renders; it does not fetch, localize, or format —
 * those are producer concerns, and keeping them out is what makes this
 * package portable.
 */
/** A term as a list card prints it: its name and the archive it links to. */
export interface EmitTermRef {
  name: string
  link?: string
}

export interface EmitPost {
  slug: string
  title: string
  /** Rendered, asset-rewritten HTML body. */
  body: string
  /**
   * Route parameters for this post beyond `slug` — the date parts of a
   * `/%year%/%monthnum%/%day%/%postname%/` permalink, a post id, anything the
   * route pattern names. Without them every post but the template one would be
   * generated at the wrong address.
   */
  params?: Record<string, string>
  /**
   * Stylesheets only this page loads (page-builder sites emit CSS per page).
   * Family-level stylesheets stay on `LayoutFamily.css.files`.
   */
  css?: string[]
  /** The site's date-format catalog applied to this post's date (index-aligned with `date{n}` marks). */
  dates?: string[]
  author?: string
  author_first?: string
  author_last?: string
  /**
   * Term names, or `{ name, link }` objects for themes whose term lists link
   * each term — a repeat block then reads `item_name` / `item_link`. The
   * `term{n}` and `terms` marks print the name either way.
   */
  terms?: Array<string | EmitTermRef>
  /** Local featured-image file names (largest first). */
  featured?: string[]
  excerpt?: string
  /** Excerpt as source HTML, for themes whose cards keep links and formatting. */
  excerpt_html?: string
  /**
   * Meta description. Falls back to `excerpt` with markup stripped — a card
   * and a description tag want the same sentence, so most producers set neither.
   */
  description?: string
  /**
   * Social image, absolute or site-root-relative. `featured` holds bare file
   * names whose serving path only the producer knows, so a crawler-usable
   * `og:image` needs this; a `featured` entry that is already a path is used.
   */
  image?: string
  /** Canonical override — for a page that should point somewhere else. Default: this page's own address. */
  canonical?: string
  /** ISO 8601, for Article structured data. `dates` holds display strings, which schema.org cannot read. */
  published_at?: string
  modified_at?: string
  /** Every author, for repeat blocks — `author` stays the first one. */
  authors?: string[]
  /** Producer-supplied extra marks, merged last. */
  marks?: Record<string, unknown>
  /** Locale of this entry, on a multilingual site — overrides the route's. */
  locale?: string
  /**
   * Content-store address of this post (model, entry id, locale) — what a
   * mounted `comments` component addresses its thread by. Only the tool that
   * wrote the content store knows it; without it the comments region mounts
   * as a placeholder.
   */
  entry?: EntrySourceRef
}

/**
 * One block of a list: a template, optional wrapper, and how many items it takes.
 *
 * Themes commonly render the newest post as a big card and the rest as a grid —
 * two different templates in two different containers. One template per list
 * cannot express that: either everything becomes a big card, or the big card is
 * baked into the chrome and page 2 shows the wrong post.
 */
export interface ListSection {
  /** Item markup with `@@marks@@`. */
  template: string
  /** Markup around this section's items; `<!--@@items@@-->` marks where they go. */
  wrapper?: string
  /** Items this section takes, in order. Omitted = the remaining items. */
  count?: number
}

/** One static path of a list route: its params and the items its list renders. */
export interface QueryPage {
  params: Record<string, string>
  items: EmitPost[]
  /**
   * Page-level marks for the list page's chrome — a term's display NAME where
   * the route parameter only carries its slug, its description, its count.
   * Without these every category page would print the template category's name.
   */
  marks?: Record<string, unknown>
  /** Stylesheets only this list page loads. */
  css?: string[]
  /**
   * Item markup with `@@mark@@` placeholders (title, date{n}, author, excerpt,
   * feat, slug), extracted from the source list. When present, list pages
   * render each item by filling the template; when absent, a plain fallback
   * list is emitted and a warning recorded — a silent fallback would read as
   * fidelity when it is not.
   *
   * Shorthand for a single-section list; `sections` takes precedence.
   */
  item_template?: string
  /** Lists whose items are not all rendered alike — a big card then a grid. */
  sections?: ListSection[]
  /** Document title for this page (`<title>`), e.g. "Category: News – Site". */
  title?: string
  /** Meta description for this list page. */
  description?: string
  /** Social image, absolute or site-root-relative. */
  image?: string
  /** Canonical override; default is this page's own address. */
  canonical?: string
}

/** Default collection name when a `single` route does not name one. */
export const DEFAULT_COLLECTION = 'posts'

export interface EmitContent {
  /** The default (`posts`) collection — shorthand for `collections.posts`. */
  posts?: EmitPost[]
  /**
   * Content per collection, for sites with more than one kind of single page
   * (posts, pages, custom post types). A `single` route reads the collection
   * named by `RouteModel.collection`.
   */
  collections?: Record<string, EmitPost[]>
  /** QueryBinding id → the static paths (and items) that query produces. */
  queries?: Record<string, QueryPage[]>
}

/** A legacy stylesheet provided by the producer, referenced from `LayoutFamily.css.files`. */
export interface EmitCssFile {
  path: string
  content: string
}

export interface EmitOptions {
  /** Generated project's package name. Default: "migrated-site". */
  projectName?: string
  /** Include Tailwind 4 as the evolution layer (default true). */
  tailwind?: boolean
  /**
   * Emit per-page SEO — title, description, canonical, Open Graph, Twitter card
   * and Article structured data — and remove the template page's copies of those
   * tags from the head chrome. Default true: inheriting one page's canonical and
   * og:title on every page is worse than having neither. Set false to keep the
   * source head verbatim and own these tags in the producer.
   */
  seo?: boolean
}

export interface EmitInput {
  ir: ProjectIR
  content?: EmitContent
  css?: EmitCssFile[]
  options?: EmitOptions
  /**
   * Where runtime components (comments, forms) talk to. Without it they are
   * emitted as placeholders and a warning names each one — a migration is
   * complete without any runtime offer being accepted.
   */
  runtime?: RuntimeBinding
}

// ─── Emit output ───

/**
 * Pure result: every generated file as path → content. Writing to disk is a
 * separate, trivial step (`writeEmit`) so the core stays testable and usable
 * from any host — CLI, service, or another emitter wrapping this one.
 */
export interface EmitResult {
  files: Record<string, string>
  warnings: string[]
}

export type { ProjectIR, RuntimeBinding, EntrySourceRef }
