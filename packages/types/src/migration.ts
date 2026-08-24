// ─── Migration Contracts ───
//
// Shared, MIT-licensed shapes for the WordPress → static-site migration pipeline.
// Producers: the WordPress Bridge plugin (GPL, separate repo), REST/WXR importers.
// Consumers: the migration engine, Studio, and the open Astro emitter.
//
// Every shape here is plain JSON — snake_case keys, no class instances, no
// functions — because these documents cross process, repository, and license
// boundaries. A GPL plugin writes RawIR; a proprietary service reads it; an MIT
// emitter consumes ProjectIR. The contract is the only thing they share, so it
// lives in the one package all of them may depend on.

/**
 * Version stamped into every migration document (`version` field on each root).
 * The four contracts evolve together with this package; a reader that sees a
 * higher version than it knows should refuse rather than guess.
 */
export const MIGRATION_CONTRACT_VERSION = 1

// ─── Source access ───

/**
 * How the WordPress site's data was reached, ordered from least to most
 * complete. Measured field coverage rises with each rung (roughly 34% for
 * public REST, 57% with an Application Password, 82% from a WXR export, 100%
 * via the Bridge plugin) — which is why provenance is recorded on every RawIR:
 * two documents for the same site are only comparable if their rungs are.
 */
export type SourceAccessKind = 'rest_public' | 'rest_auth' | 'wxr' | 'bridge'

/** The ladder in ascending completeness order. */
export const SOURCE_ACCESS_LADDER = [
  'rest_public',
  'rest_auth',
  'wxr',
  'bridge',
] as const satisfies readonly SourceAccessKind[]

// ─── RawIR ───
//
// Source-faithful extraction of a WordPress site: what the source said, before
// any interpretation. Unresolved references are kept and *marked* (`resolved`
// flags) instead of dropped — deciding what a broken reference means is the
// consumer's job, not the extractor's.

export interface RawProvenance {
  kind: SourceAccessKind
  /** ISO 8601 UTC time the extraction ran. */
  fetched_at?: string
  /** Name/version of the producing tool (e.g. "wordpress-bridge/1.0"). */
  tool?: string
}

export interface RawSite {
  url: string
  title?: string
  description?: string
  /** WXR distinguishes the WP install URL from the public site URL. */
  base_site_url?: string
  base_blog_url?: string
  /** Site language as reported (e.g. "en-US"); multilingual detail lives in `language_pairs`. */
  language?: string | null
  /** Generator string (WordPress version) when the source exposed it. */
  generator?: string | null
  /** WXR export timestamp, when the source was a WXR file. */
  export_date?: string | null
  wxr_version?: string | null
}

export interface RawAuthor {
  id: number | null
  login: string
  email?: string | null
  display_name: string
  first_name?: string | null
  last_name?: string | null
}

export interface RawTerm {
  id: number | null
  taxonomy: string
  slug: string
  name: string
  /** Parent term slug within the same taxonomy, when hierarchical. */
  parent?: string | null
  /** Whether `parent` names a term present in this document. */
  parent_resolved?: boolean | null
  description?: string
}

/** A post's reference to a term — kept even when the term itself is absent. */
export interface RawTermRef {
  taxonomy: string
  slug: string
  name: string
  /** Whether the referenced term exists in this document's `terms`. */
  resolved: boolean
}

/** An ACF field value paired with its field-definition key (`field_…`). */
export interface RawAcfValue {
  value: unknown
  field_key: string
}

export interface RawPost {
  id: number
  /** WordPress post type — "post", "page", or a custom post type slug. */
  type: string
  /** WordPress status verbatim ("publish", "draft", "future", "pending", …). */
  status: string
  slug: string
  title: string
  /** Public permalink, when known. Permalink *structure* is a site setting; the link is the fact. */
  link?: string | null
  guid?: string | null
  /** Author login; resolve against `RawIR.authors`. */
  author: string | null
  /** ISO 8601 UTC, null when the source carried no usable date. */
  date: string | null
  modified: string | null
  /** Rendered/exported HTML body, untransformed. */
  content: string
  excerpt: string
  parent?: number | null
  menu_order?: number
  sticky?: boolean
  password?: string | null
  comment_status?: string | null
  ping_status?: string | null
  terms: RawTermRef[]
  /**
   * Post meta, PHP-serialized values already decoded where possible.
   * Core WP keys (underscore-prefixed) are included: which keys matter is a
   * downstream decision.
   */
  meta: Record<string, unknown>
  /** Meta keys whose values were PHP-serialized in the source (decoded above). */
  serialized_keys?: string[]
  /** ACF fields recovered by pairing `foo` with `_foo = "field_…"`. */
  acf?: Record<string, RawAcfValue>
}

export interface RawAttachment {
  id: number
  title: string
  slug: string
  /** Original file URL. Downloading/re-hosting is a consumer concern. */
  url: string | null
  alt?: string
  caption?: string
  description?: string
  /** Relative upload path (`_wp_attached_file`), when present. */
  file?: string | null
  /** `_wp_attachment_metadata` verbatim (sizes, EXIF, …). */
  image_meta?: unknown
  mime?: string | null
  parent?: number | null
  parent_resolved?: boolean | null
  author?: string | null
  date?: string | null
  status?: string
  meta?: Record<string, unknown>
}

/** Where a menu item points. `resolved` says whether the target exists in this document. */
export type RawMenuTarget =
  | { kind: 'url'; url: string; resolved: true }
  | { kind: 'post'; post_type: string; id: number | null; slug: string | null; resolved: boolean }
  | { kind: 'term'; taxonomy: string; id: number | null; slug: string | null; resolved: boolean }
  | { kind: 'archive'; post_type: string; resolved: true }
  | { kind: 'unknown'; resolved: false }

export interface RawMenuItem {
  id: number
  title: string
  order?: number
  /** Parent menu-item id for nested menus. */
  parent?: number | null
  parent_unresolved?: boolean
  url?: string | null
  target: RawMenuTarget
  /** `target` attribute for the rendered link (e.g. "_blank"). */
  target_attr?: string | null
  classes?: string[]
  description?: string
  status?: string
}

export interface RawMenu {
  id: number | null
  slug: string
  name: string
  items: RawMenuItem[]
}

export interface RawComment {
  id: number
  /** Post id this comment belongs to. */
  post: number
  post_type?: string
  parent?: number | null
  parent_resolved?: boolean | null
  author: string
  email?: string | null
  url?: string | null
  /**
   * ISO 8601 UTC. Producers MUST normalize to UTC — comment import fidelity
   * ("zero record and parent loss") includes `created_at`, and a site-local
   * date silently corrupts it. When normalization is impossible, ship the
   * source's GMT column in `date_gmt` and leave `date` null.
   */
  date: string | null
  date_gmt?: string | null
  content: string
  /**
   * WordPress approval flag. Fixed vocabulary: `'1'` (approved), `'0'`
   * (pending), `'spam'`, `'trash'` — consumers map these; unknown strings
   * pass through for forward compatibility, never dropped.
   */
  approved?: '1' | '0' | 'spam' | 'trash' | (string & {})
  type?: string
  user_id?: number | null
  meta?: Record<string, unknown>
}

/** A redirect rule (e.g. from the Redirection plugin — visible from the authenticated rung up). */
export interface RawRedirect {
  from: string
  to: string
  status?: number
  /** Which plugin/table produced the rule. */
  source?: string
}

/** Translation grouping for multilingual sites (Polylang/WPML — bridge rung). */
export interface RawLanguagePair {
  post: number
  /** locale → post id of the translation. */
  translations: Record<string, number>
}

/**
 * The complete raw extraction of one WordPress site at one access rung.
 * This is the boundary document between extraction (Bridge/importers) and
 * everything downstream — content conversion, capability analysis, migration.
 */
export interface RawIR {
  version: number
  provenance: RawProvenance
  site: RawSite
  authors: RawAuthor[]
  terms: RawTerm[]
  posts: RawPost[]
  attachments: RawAttachment[]
  menus?: RawMenu[]
  comments?: RawComment[]
  redirects?: RawRedirect[]
  language_pairs?: RawLanguagePair[]
  /** Site options (bridge rung), verbatim. */
  options?: Record<string, unknown>
}

// ─── CapabilityManifest ───
//
// What the site *uses*, as detected — the input for migration planning,
// effort/pricing, and the "what happens to X" conversation with the user.
// Detection is evidence-based and never certain; `present: true` with evidence
// beats a silent guess.

export const CAPABILITY_KEYS = [
  'seo',
  'forms',
  'comments',
  'search',
  'newsletter',
  'analytics',
  'consent',
  'share',
  'video',
  'ads',
  'builder',
  'blocks',
  'i18n',
  'cache',
  'security',
  'acf',
  'ecommerce',
  'jetpack',
  'redirects',
  'membership',
  'accessibility',
  'media',
  'scheduling',
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

export interface CapabilityDetection {
  present: boolean
  /** Identified plugin/provider, when known (e.g. "yoast", "contact-form-7"). */
  plugin?: string | null
  /** How it was detected: "rest", "dom", "slug", "headers", "meta", … */
  evidence?: string[]
  detail?: string
}

export interface CapabilityManifest {
  version: number
  site_url: string
  access: {
    html_status?: number | null
    rest_status?: number | null
    /** Highest source-access rung actually achieved for this site. */
    achieved: SourceAccessKind
  }
  generator?: string | null
  theme?: string | null
  plugins?: string[]
  rest_namespaces?: string[]
  custom_post_types?: Array<{
    slug: string
    /** Whether the CPT is exposed in public REST (`rest: false` CPTs need a higher rung). */
    rest_visible: boolean
    count?: number | null
  }>
  /** Comments get first-class treatment: they are a launch-critical capability. */
  comments: {
    active: boolean
    form_status?: 'open' | 'closed' | 'mixed' | null
    rest_total?: number | null
    plugin?: string | null
  }
  capabilities: Partial<Record<CapabilityKey, CapabilityDetection>>
  /** Dynamic front-end behaviors observed in the DOM ("carousel", "modal", "search-overlay", …). */
  behaviors?: string[]
  languages?: string[]
}

// ─── ProjectIR ───
//
// The reproducible model of the site: not "this page's HTML" but the design
// system, component architecture, route model, and content queries that let
// *unseen* pages — tomorrow's posts, another category — be generated correctly.
// Produced by analysis; consumed by the open emitter. Three layers are kept
// together on purpose: visual structure (families/chrome/tokens), content
// binding (slots), and business rules (routes/queries). A page family exists
// per genuinely different behavior, not per page.

/**
 * How the legacy CSS for a family was packaged.
 * - `purge_set`: rules kept if used by any page in the family's page set —
 *   small file, safe against per-page rule loss (single-page purging is not).
 * - `localcss`: the site's stylesheets localized wholesale — larger, zero risk.
 */
export type CssStrategy = 'purge_set' | 'localcss'

/**
 * Cascade layer name the emitter quarantines legacy CSS under, so a modern
 * utility layer (e.g. Tailwind) can coexist with pixel-faithful migrated pages.
 */
export const LEGACY_CSS_LAYER = 'legacy'

/** Design tokens extracted from the source site, e.g. for a Tailwind `@theme` block. */
export interface DesignTokens {
  colors?: Record<string, string>
  font_families?: Record<string, string>
  font_sizes?: Record<string, string>
  spacing?: Record<string, string>
  breakpoints?: Record<string, string>
}

export type RouteKind =
  | 'front'
  | 'single'
  | 'page'
  | 'archive'
  | 'term'
  | 'author'
  | 'date'
  | 'search'
  | 'not_found'
  | 'custom'

export interface RouteParamDef {
  name: string
  source: 'post_slug' | 'term_slug' | 'author_slug' | 'page_number' | 'custom'
}

/** Selects a family/component variant when a route parameter matches. */
export interface RouteVariantRule {
  param: string
  in: string[]
  variant: string
}

/**
 * One route pattern → one layout family. Pagination is a parameter of a route
 * (`/news/page/2` is `/news` with `page_number = 2`), never a separate family —
 * across a 30-site corpus, page 2 never produced a new layout.
 */
export interface RouteModel {
  id: string
  /** URL pattern with `:param` placeholders, e.g. "/category/:term", "/news/page/:page". */
  pattern: string
  kind: RouteKind
  /** LayoutFamily id. */
  family: string
  params?: RouteParamDef[]
  /** QueryBinding id feeding this route's list, when it renders one. */
  query?: string
  variant_rules?: RouteVariantRule[]
}

export type SlotKind =
  | 'body'
  | 'title'
  | 'date'
  | 'excerpt'
  | 'author_name'
  | 'author_link'
  | 'featured_image'
  | 'term_list'
  | 'self_link'
  | 'custom'

/** Where a content field lands in a family's markup. */
export interface SlotBinding {
  kind: SlotKind
  /** CSS selector of the slot's container, when one could be determined. */
  selector?: string
  /** Content-model field backing a `custom` slot. */
  field?: string
  /** Date rendering format for `date` slots, as observed on the source site. */
  date_format?: string
}

/**
 * Marker a `body`-position chrome chunk carries where the page content goes.
 * A comment survives serialization, renders as nothing if ever left behind,
 * and — critically — can sit at ANY nesting depth: real themes put the content
 * container deep inside the chrome (`article > div.entry-content`), so the
 * chrome cannot be split into balanced before/after fragments. The emitter
 * splices content in at this marker and injects the result as ONE fragment.
 */
export const CHROME_BODY_SLOT = '<!--@@body@@-->'

/**
 * A rendered, asset-rewritten chunk of site chrome the emitter injects verbatim.
 * Positions: `head` lands in `<head>`; `body` is the whole body chrome carrying
 * `CHROME_BODY_SLOT` where content goes (preferred — nesting-safe); the legacy
 * `before_body`/`after_body` pair is composed into a single body with the slot
 * between them (only correct when the content container is top-level).
 */
export interface ChromeChunk {
  id: string
  position: 'head' | 'body' | 'before_body' | 'after_body'
  html: string
}

export interface ComponentPlacement {
  /** ComponentDef id. */
  component: string
  variant?: string
  selector?: string
}

export interface FamilyVariant {
  key: string
  description?: string
}

export interface LayoutFamily {
  id: string
  name?: string
  kind?: RouteKind
  chrome?: ChromeChunk[]
  slots?: SlotBinding[]
  components?: ComponentPlacement[]
  css: {
    strategy: CssStrategy
    /** Emitted stylesheet paths, relative to the generated project. */
    files?: string[]
  }
  /** Observed column counts per viewport class (e.g. desktop 4 → mobile 1). */
  columns?: Partial<Record<'desktop' | 'mobile', number>>
  variants?: FamilyVariant[]
  /** Verification trail: which pages formed the family, held-out fidelity score. */
  evidence?: {
    pages?: string[]
    holdout_score?: number
  }
}

/**
 * Component semantic vocabulary. `source` records where its content can come
 * from: `rest` (derivable from content data — author box, term list),
 * `runtime` (needs a live service — comments form, search), `chrome` (carried
 * as rendered markup — nav, ads).
 */
export const COMPONENT_TYPES = [
  'nav',
  'related',
  'comments',
  'ads',
  'chrome',
  'taxonomy',
  'author',
  'share',
  'breadcrumb',
  'meta',
  'pagination',
  'card',
  'custom',
] as const

export type ComponentType = (typeof COMPONENT_TYPES)[number]

export type ComponentSource = 'rest' | 'runtime' | 'chrome'

export interface ComponentVariantDef {
  key: string
  conditions?: RouteVariantRule[]
  description?: string
}

export interface ComponentDef {
  id: string
  type: ComponentType
  source: ComponentSource
  name?: string
  selector?: string
  /** e.g. a card component with `news`, `compact`, `featured` variants. */
  variants?: ComponentVariantDef[]
}

export type ExcerptSource = 'excerpt' | 'content_first_paragraph' | 'none'
export type PaginationKind = 'numbered' | 'infinite' | 'none'

/**
 * The query behind a rendered list: which content, filtered how, in what
 * order, how many. Inferred by matching rendered items against candidate
 * queries — order matters, so the sequence is part of the contract.
 */
export interface QueryBinding {
  id: string
  /** Content source: "posts", "pages", a CPT slug, or a content-model id. */
  source: string
  taxonomy?: {
    taxonomy: string
    /** Fixed term slug, or the route param carrying it. */
    term?: string
    term_param?: string
  }
  author?: {
    slug?: string
    param?: string
  }
  order: {
    by: 'date' | 'title' | 'menu_order' | 'custom'
    direction: 'asc' | 'desc'
  }
  per_page: number | null
  pagination: PaginationKind
  excerpt_source?: ExcerptSource
  /** WordPress image size name the list renders (e.g. "medium_large"). */
  image_size?: string
}

/**
 * - `responsive`: one build, CSS handles viewports.
 * - `split`: desktop and mobile variants are produced separately and served
 *   by device — for sites whose mobile DOM differs beyond CSS.
 */
export type ViewportStrategy = 'responsive' | 'split'

export interface ProjectIR {
  version: number
  site: {
    url: string
    title?: string
    locales?: string[]
  }
  routes: RouteModel[]
  families: LayoutFamily[]
  components?: ComponentDef[]
  queries?: QueryBinding[]
  tokens?: DesignTokens
  /** Default CSS packaging for families that don't override it. */
  css_default: CssStrategy
  viewport_strategy?: ViewportStrategy
  /** Content-model ids this project's queries and slots refer to. */
  content_models?: string[]
}

// ─── Comments export ───
//
// Comments cross one more boundary than the rest of RawIR: they leave the
// generated static site entirely and land in a live service's database,
// addressed by content entry — not by WordPress post id. This export is that
// bridge: the source map translates WP ids to entry addresses, and the
// comments ride along unmodified.

export const COMMENTS_EXPORT_FORMAT = 'contentrain-comments@1'

/** Where one WordPress post's content ended up. */
export interface EntrySourceRef {
  model_id: string
  entry_id: string
  locale?: string
}

/**
 * WordPress post id (stringified) → content entry address. Only the tool that
 * wrote the content store can produce this; nothing downstream can recover it.
 */
export type EntrySourceMap = Record<string, EntrySourceRef>

export interface CommentsExport {
  version: number
  format: typeof COMMENTS_EXPORT_FORMAT
  source: RawProvenance
  site_url?: string
  /** ISO 8601 UTC. */
  generated_at: string
  entries: EntrySourceMap
  /** WP post ids whose comment form was closed — the receiving side opens those threads closed. */
  threads_closed?: number[]
  /** Verbatim `RawComment`s; parents are re-linked via `RawComment.parent` in a second pass. */
  comments: RawComment[]
}

/** Comments summary + payload pointer on the handoff (capability counts are not enough for intake). */
export interface HandoffComments {
  total: number
  by_status?: Record<string, number>
  types?: Record<string, number>
  export?: {
    format: typeof COMMENTS_EXPORT_FORMAT
    /** Where the full export can be fetched… */
    url?: string
    /** …or the export itself, inline, for small sites. */
    inline?: CommentsExport
  }
  threads_closed?: number[]
  unresolved?: Array<{ comment_id: number; post: number; reason: string }>
}

// ─── MigrationHandoff ───
//
// What the migration hands the user: where the generated project lives, what
// happened to each detected capability, and — for capabilities that need a
// runtime — the offers. Offering is this document's job; fulfilling an offer
// is the receiving product's. The migration itself is complete without any
// offer being accepted.

export type CapabilityDisposition =
  | 'migrated_static'
  | 'archived'
  | 'needs_runtime'
  | 'external_adapter'
  | 'kept_on_wordpress'
  | 'dropped'

export interface HandoffCapability {
  key: CapabilityKey
  disposition: CapabilityDisposition
  detail?: string
  /** e.g. comments: { migrated: 412, spam_skipped: 60 } */
  counts?: Record<string, number>
}

export type OfferProvider = 'studio_managed' | 'adapter' | 'keep_wordpress'

export interface CostEstimate {
  currency: string
  monthly: number
  assumptions?: string[]
}

/**
 * The comparison shown when a runtime capability is offered: what running the
 * old server costs (maintenance, security, hosting) against the managed
 * option — so declining is an informed choice, not a default.
 */
export interface CostComparison {
  self_host?: CostEstimate
  managed?: CostEstimate
}

export interface HandoffOffer {
  capability: CapabilityKey
  provider: OfferProvider
  /** Adapter identifier when `provider` is `adapter`. */
  adapter?: string
  cost_comparison?: CostComparison
  /** e.g. "keeping comments on WordPress means the WordPress server stays live". */
  warning?: string
}

export interface MigrationHandoff {
  version: number
  site_url: string
  /** ISO 8601 UTC. */
  generated_at: string
  repository?: {
    provider: 'github' | 'gitlab'
    owner: string
    name: string
    default_branch: string
  }
  preview_url?: string
  content_summary?: {
    models: number
    entries: number
    locales?: string[]
  }
  capabilities: HandoffCapability[]
  /** Present whenever the source had comments — see `HandoffComments`. */
  comments?: HandoffComments
  offers?: HandoffOffer[]
  notes?: string[]
}
