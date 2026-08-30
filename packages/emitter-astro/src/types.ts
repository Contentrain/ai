import type { ProjectIR } from '@contentrain/types'

// ─── Emit input ───

/**
 * One piece of content ready to render: body already HTML, assets already
 * rewritten to local paths, dates already formatted in the site's observed
 * formats. The emitter renders; it does not fetch, localize, or format —
 * those are producer concerns, and keeping them out is what makes this
 * package portable.
 */
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
  terms?: string[]
  /** Local featured-image file names (largest first). */
  featured?: string[]
  excerpt?: string
  /** Excerpt as source HTML, for themes whose cards keep links and formatting. */
  excerpt_html?: string
  /** Every author, for repeat blocks — `author` stays the first one. */
  authors?: string[]
  /** Producer-supplied extra marks, merged last. */
  marks?: Record<string, unknown>
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
   */
  item_template?: string
}

export interface EmitContent {
  /** Content for `single` routes, keyed by nothing — slug lives on the post. */
  posts?: EmitPost[]
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
}

export interface EmitInput {
  ir: ProjectIR
  content?: EmitContent
  css?: EmitCssFile[]
  options?: EmitOptions
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

export type { ProjectIR }
