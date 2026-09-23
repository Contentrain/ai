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
 * complete. Field coverage rises with each rung — measured in August 2026 at
 * roughly 34% for public REST, 57% with an Application Password and 82% from a
 * WXR export; the Bridge plugin reads WordPress from inside and is meant to
 * reach every field — which is why provenance is recorded on every RawIR:
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
  /**
   * Language of this post as the multilingual plugin reports it — Polylang's
   * `lang` slug (`tr`), WPML's `wpml_current_locale` (`tr_TR`), or the WXR
   * `language` taxonomy term. Absent on monolingual sites. Which posts are
   * translations of each other is `RawIR.language_pairs`, not this field.
   */
  lang?: string | null
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

/**
 * How a redirect's `from` is compared with a request path. Only `url` without
 * `regex` is a plain one-to-one mapping; the others are patterns, and turning
 * one into a literal `from` produces the wrong redirect.
 */
export type RawRedirectMatch = 'url' | 'regex' | 'start' | 'contains' | 'end'

/** A redirect rule the live site serves (e.g. from the Redirection plugin — visible from the authenticated rung up). */
export interface RawRedirect {
  from: string
  to: string
  status?: number
  /** Which plugin/table produced the rule. */
  source?: string
  /** Stable id within the export, `<source>:<source-specific id>`. */
  id?: string
  /** How `from` matches; absent means `url`. */
  match?: RawRedirectMatch
  /** `from` is a regular expression in the source's own dialect. */
  regex?: boolean
  /** The source's own module/group serving it, when it has one (e.g. Redirection's "Apache"). */
  served_by?: string
  /** An adjustment the extractor made, stated rather than hidden (e.g. a non-redirect status read as 301). */
  status_note?: string
}

/**
 * A rule a source holds that the site does not serve as a plain redirect, with
 * the reason. Every rule lands in `RawIR.redirects` or here, so the two
 * together account for the source's whole table.
 */
export interface RawRedirectExcluded extends Omit<Partial<RawRedirect>, 'match'> {
  id: string
  source: string
  /** The source's own match type — may be a condition (`login`, `referrer`, …) rather than a {@link RawRedirectMatch}. */
  match?: RawRedirectMatch | (string & {})
  reason:
    | 'disabled'
    | 'source-inactive'
    | 'slug-reused'
    | 'no-slug-address'
    | `not-a-redirect:${string}`
    | `conditional-match:${string}`
  /** The condition a conditional rule depends on, verbatim. */
  condition?: unknown
}

// ─── SEO ───

export const SEO_PROVIDERS = ['yoast', 'rank_math', 'aioseo', 'seopress'] as const
export type SeoProvider = (typeof SEO_PROVIDERS)[number]

/** Whether a provider runs on the site, and its version. */
export interface SeoProviderStatus {
  status: 'active' | 'inactive-with-data' | 'absent'
  version?: string
}

/** One page's SEO as one provider holds it. */
export interface RawSeoEntry {
  /** true: the running plugin rendered these values; false: stored values and templates only. */
  resolved?: boolean
  title?: string
  description?: string
  canonical?: string
  robots?: { index?: 'index' | 'noindex', follow?: 'follow' | 'nofollow', advanced?: string[] }
  /** The directives the page actually carries, after WordPress core and the plugin reconcile them. */
  robots_served?: string[]
  open_graph?: { title?: string, description?: string, type?: string, url?: string, image?: string, site_name?: string }
  twitter?: { card?: string, title?: string, description?: string, image?: string }
  focus_keyword?: string
  /** Schema.org types, and the JSON-LD graph when the plugin rendered it. */
  schema?: { types: string[], graph?: unknown }
  /** What the plugin stored for this page (templates such as `%%title%% %%sep%%`), secrets removed. */
  stored?: Record<string, unknown>
  /**
   * The page's SEO as the exporter rendered the plugin's templates itself,
   * for a plugin that is not the one serving the live head (`resolved` is
   * not true): final text, no template tokens. A template variable it could
   * not render is taken out of the string (and the separators it leaves
   * tidied) and named in `unresolved`.
   */
  rendered?: {
    title?: string
    description?: string
    canonical?: string
    robots?: { index?: 'index' | 'noindex', follow?: 'follow' | 'nofollow' }
    /** `image_width` / `image_height` when the image is a local attachment of known size. */
    open_graph?: { title?: string, description?: string, image?: string, image_width?: number, image_height?: number }
    twitter?: { title?: string, description?: string, image?: string, image_width?: number, image_height?: number }
    /** Schema nodes the plugin stored for the page (Rank Math), their variables rendered, the plugin's own `metadata` key removed. */
    schema?: { graph: object[] }
  }
  /** Who rendered `rendered`, e.g. `bridge`. */
  rendered_by?: string
  /** Where each rendered value's template came from: the page's own, its post type's, or the plugin default. */
  template_source?: Partial<Record<'title' | 'description' | 'robots', 'post' | 'post_type' | 'default'>>
  /** Template tokens `rendered` could not resolve (e.g. `%customfield(x)%`) — removed from its strings, listed for a person to see. */
  unresolved?: string[]
}

/** A provider's site-wide settings. */
export interface RawSeoSettings {
  separator?: string | null
  /** Keyed by context: `post`, `page`, `home`, `author`, `archive`, `tax:<taxonomy>`, `ptarchive-<type>`, … */
  title_templates: Record<string, string>
  description_templates: Record<string, string>
  noindex?: Record<string, boolean>
  social?: Record<string, unknown>
  /** Site verification codes — public meta values. */
  verification?: Record<string, string>
  /** Option name → cleaned value, verbatim otherwise. */
  raw: Record<string, unknown>
}

/**
 * The site's SEO layer: which plugin serves the head, its settings, and each
 * page's values. `status: 'none'` is an answer — no SEO plugin, and WordPress
 * core renders only the title — not a missing export.
 */
export interface RawSeo {
  /** Producer's format identifier, e.g. `contentrain-bridge-seo@1`. */
  format?: string
  status: 'present' | 'none'
  /** Whose output the live site serves. */
  serving: SeoProvider | 'wordpress-core'
  /** SEOPress is optional here: exports made before it was covered do not name it. */
  providers: Record<Exclude<SeoProvider, 'seopress'>, SeoProviderStatus> & Partial<Record<'seopress', SeoProviderStatus>>
  settings: Partial<Record<SeoProvider, RawSeoSettings>>
  /** `post:<id>` or `term:<taxonomy>:<id>` → one block per provider that has data for it. */
  entries: Record<string, Partial<Record<SeoProvider, RawSeoEntry>>>
  /** Values deliberately not exported (e.g. a sensitive key), by address. */
  excluded?: { source: string, reason: string }[]
}

// ─── Routing ───

/** A page WordPress routes to itself (front page, posts page). */
export interface RawRoutedPage {
  id: number
  slug: string
  /** Site-root-relative address. */
  path: string
}

/**
 * The site's URL rules — what `RawPost.link` holds as facts, stated as the
 * structure that produced them. Permastructs are site-root-relative with
 * `front` already applied where `with_front` asks for it.
 */
export interface RawRouting {
  /** Producer's format identifier, e.g. `contentrain-bridge-routing@1`. */
  format?: string
  /** The site's home URL. */
  home?: string
  permalink_structure: string
  /** Plain `?p=` permalinks — no structure at all. */
  plain: boolean
  trailing_slash: boolean
  front: string
  category_base: string
  tag_base: string
  pagination_base: string
  author_base: string
  search_base: string
  feed_base?: string
  comments_pagination_base?: string
  author_structure?: string | null
  date_structure?: string | null
  page_structure?: string | null
  /** `posts` or `page`. */
  show_on_front: string
  page_on_front?: RawRoutedPage | null
  page_for_posts?: RawRoutedPage | null
  posts_per_page: number
  post_types: {
    name: string
    hierarchical: boolean
    rewrite: { slug?: string, with_front?: boolean, feeds?: boolean, pages?: boolean } | false
    permastruct: string | null
    has_archive: boolean
    archive_path: string | null
    query_var: string | false
  }[]
  taxonomies: {
    name: string
    object_types: string[]
    hierarchical: boolean
    rewrite: { slug?: string, with_front?: boolean, hierarchical?: boolean } | false
    permastruct: string | null
  }[]
}

// ─── Hardcoded text ───
//
// Interface text that lives outside the content tables — theme templates,
// scripts, widgets, menus, options, Customizer mods, and what the rendered
// pages show. Every piece found gets exactly one outcome: transferred to a
// named target, excluded with a reason, or — for a source that could not be
// read — an error. Nothing is dropped silently.

/** Where a candidate was found. */
export const TEXT_CANDIDATE_KINDS = [
  'php-gettext',
  'php-html',
  'php-echo',
  'html',
  'js',
  'widget',
  'menu',
  'option',
  'customizer',
  'render',
] as const

export type RawTextCandidateKind = (typeof TEXT_CANDIDATE_KINDS)[number]

/** Why a candidate is not transferred. `RawTextCandidate.reason` joins one or more with `,`. */
export const TEXT_EXCLUDE_REASONS = [
  'empty',
  'too-long',
  'secret',
  'code',
  'url',
  'number',
  'no-letters',
  'placeholder-only',
  'dynamic',
  'not-text',
  'content',
  'rendered-from-source',
] as const

export type RawTextExcludeReason = (typeof TEXT_EXCLUDE_REASONS)[number]

/** Where a transferred candidate lands in the store. */
export type RawTextTarget =
  | 'dictionary:ui-strings'
  | `theme-settings.${string}`
  | 'site.title'
  | 'site.description'
  | 'content:wp-menu-items'

/** One place a candidate's text was found. */
export interface RawTextOccurrence {
  kind: RawTextCandidateKind
  /** A file path relative to `wp-content`, `render:<state>`, `nav_menu_item#<id>`, … */
  source: string
  /** 1-based line in a file; `0` for a source without lines (render, menu, option). */
  line: number
}

/**
 * One piece of interface text in one place. Candidates merge only when text,
 * locale and context are all equal: "Read more" in an `a` and in a `button`
 * are two candidates, and so are `_x('Post', 'noun')` and `_x('Post', 'verb')`.
 */
export interface RawTextCandidate {
  /** `sha256(text \0 locale \0 context)`, first 20 hex characters. */
  id: string
  /** The text; `[redacted]` when `reason` includes `secret`. */
  value: string
  locale: string
  /**
   * Where the text sits: an HTML tag (`a`, `input@placeholder`),
   * `gettext[:<ctx>][:plural]`, `js`, `widget:<tag>` / `widget:title`, `menu`,
   * `option:<name>`, `customizer:<mod>`, or for rendered text
   * `<landmark>><tag>` (`footer>p`, `nav>nav@aria-label`).
   */
  context: string
  kind: RawTextCandidateKind
  /** The first occurrence's `source` and `line`. */
  source: string
  line: number
  /** Every place the text was found, in the producer's listing order. */
  occurrences: RawTextOccurrence[]
  outcome: 'transfer' | 'exclude'
  /** Set exactly when `outcome` is `transfer`. */
  target?: RawTextTarget
  /** Set exactly when `outcome` is `exclude`: one or more `RawTextExcludeReason`s joined with `,`. */
  reason?: string
  /**
   * With `rendered-from-source`: ids of the source candidates this page text
   * came from. Page text found in source is excluded here and transferred
   * there, so the same words never land twice and contexts are not merged.
   */
  related?: string[]
  /**
   * The store key: `<group>.<context>.<words>-<sha256(text \0 context)[0:6]>`,
   * or `theme-settings.<mod>` for a Customizer value. A function of text and
   * context only — moving a string to another file changes no key. A
   * collision fails the export rather than merging two texts.
   */
  key: string
  decision: 'review' | 'include' | 'exclude'
}

/**
 * Every piece of interface text a site shows, each with one outcome. Totals
 * close: `by_outcome.transfer + by_outcome.exclude = candidates`,
 * `by_outcome.error = errors.length`, and `occurrences` counts every
 * occurrence the scanners found — listed ones plus those past the per-file
 * listing cap, which are counted by reason instead.
 */
export interface RawHardcodedText {
  /** Producer's format identifier, e.g. `contentrain-bridge-hardcoded-text@1`. */
  format: string
  candidates: RawTextCandidate[]
  /**
   * Sources that could not be read — an outcome, not a silent gap. Reasons:
   * `source-over-2MiB`, `source-unreadable`, `render-fetch-failed: <code>`,
   * `render-http-<status>`, `render-no-body`.
   */
  errors: { source: string, reason: string }[]
  totals: {
    occurrences: number
    occurrences_listed: number
    /** Occurrences past the listing cap: excluded and counted, not listed. */
    unlisted_excluded: number
    unlisted_by_reason: Record<string, number>
    candidates: number
    by_outcome: { transfer: number, exclude: number, error: number }
    sources: { files: number, settings: number, render_states: number }
  }
}

// ─── Integrations ───
//
// Outside services the site is connected to — analytics, CRM, newsletter,
// captcha, CDN, embeds. A static site cannot carry these connections over:
// each one with an account must be connected again, with the new site's own
// credentials. Credentials never leave WordPress; only whether one is set does.

export const INTEGRATION_CATEGORIES = ['analytics', 'crm', 'newsletter', 'ads', 'comments', 'captcha', 'cdn', 'other'] as const

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number]

export const INTEGRATION_EVIDENCE_KINDS = ['plugin', 'option-key', 'script-domain', 'form-config', 'embed-domain'] as const

export type IntegrationEvidenceKind = (typeof INTEGRATION_EVIDENCE_KINDS)[number]

/** One outside service the site uses, and why we believe it does. */
export interface RawIntegration {
  /** Catalog id: `mailchimp`, `hubspot`, `google-tag-manager`, `jetpack-stats`, `embed-youtube`, … */
  service: string
  /** Display name. */
  name: string
  category: IntegrationCategory
  /**
   * Never a value. `detail` names a plugin and its version, a setting by name
   * (`mc4wp (api_key)`), a script host and where it was seen
   * (`static.hotjar.com @ render:home`), a form's wiring, or an embed host.
   */
  evidence: { kind: IntegrationEvidenceKind, detail: string }[]
  /** An account must be connected again on the new site; `false` for an embed, which has no account. */
  reconnect_required: boolean
  /** A credential is configured on WordPress. Only this boolean is exported, never the value. */
  secret_present: boolean
  /** What to do, in words for the person receiving the site. */
  notes: string
}

/**
 * The document a bridge writes (`bridge/integrations.json`). `RawIR.integrations`
 * carries its `services`. An empty `services` with `scanned` beside it is an
 * answer — the site uses no outside service we recognise — not a missing scan.
 */
export interface RawIntegrationScan {
  /** Producer's format identifier, e.g. `contentrain-bridge-integrations@1`. */
  format: string
  /** How much was looked at: option and post counts, active plugins, script sources, and whether the home page was rendered. */
  scanned: { options: number, plugins: number, posts: number, rendered_home: boolean, script_sources: number }
  services: RawIntegration[]
  totals: { services: number, reconnect_required: number }
}

/**
 * The intake / handoff issue for services that must be connected again. Raised
 * once, listing every `RawIntegration` with `reconnect_required: true`; not
 * raised when there are none.
 */
export interface IntegrationReconnectRequiredIssue {
  code: 'integration_reconnect_required'
  services: Pick<RawIntegration, 'service' | 'name' | 'category' | 'secret_present'>[]
}

/**
 * Translation grouping for multilingual sites. The REST rungs read it from
 * Polylang's `translations` / WPML's `wpml_translations` post fields, WXR from
 * the `post_translations` taxonomy; the bridge rung from the plugin tables.
 * One pair per group; `translations` includes the post itself.
 */
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
  /** Rules the sources hold that the site does not serve as plain redirects. */
  redirects_excluded?: RawRedirectExcluded[]
  seo?: RawSeo
  routing?: RawRouting
  /** Interface text outside the content tables, each piece with one outcome. */
  hardcoded_text?: RawHardcodedText
  /** Outside services the site is connected to (`RawIntegrationScan.services`). */
  integrations?: RawIntegration[]
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
    /**
     * Highest source-access rung actually achieved for this site, or `null`
     * when none was — the site answered nothing a rung describes.
     *
     * Nullable rather than optional, and rather than a `'none'` rung. Optional
     * would let a producer omit the field and call that "not measured", which
     * is the failure this field exists to prevent: a manifest that reports
     * `rest_public` for every site makes the access ladder unreadable, and the
     * ladder is what the coverage figures are computed from. Required-and-
     * nullable makes "I reached nothing" a thing the producer has to say.
     *
     * A `'none'` rung was the other candidate and is worse: `SourceAccessKind`
     * is also `RawProvenance.kind`, where it answers "how was this data
     * obtained". A RawIR stamped `kind: 'none'` is a document that exists
     * without having been obtained — an impossible state made representable in
     * an unrelated contract. `SOURCE_ACCESS_LADDER` would stop being a ladder
     * too: it is an ordered array and coverage arithmetic indexes into it.
     *
     * `null` reads with `rest_status: null` beside it as its evidence. Coverage
     * arithmetic should drop these sites from the numerator, not score them
     * zero — a site behind an access wall was not measured, it did not fail.
     */
    achieved: SourceAccessKind | null
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
  /**
   * Where the value comes from. The date parts exist because
   * `/%year%/%monthnum%/%day%/%postname%/` is a common WordPress permalink
   * structure: treating the template post's date as a fixed prefix sends every
   * other post to a wrong address, and SEO continuity is the point of a
   * migration. Posts carry their own values (`EmitPost.params`).
   */
  source:
    | 'post_slug'
    | 'post_id'
    | 'post_year'
    | 'post_month'
    | 'post_day'
    | 'term_slug'
    | 'author_slug'
    | 'page_number'
    | 'custom'
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
  /**
   * URL pattern with `:param` placeholders — `/category/:term`, `/news/page/:page`.
   *
   * A trailing `*` marks a **multi-segment (rest) parameter**: `/category/:term*`
   * matches `/category/about-cc/events/` with `term = "about-cc/events"`.
   * Hierarchical taxonomies and nested pages need this — a single-segment
   * parameter silently flattens `/category/about-cc/events/` to
   * `/category/events/`, breaking link continuity for every nested address.
   */
  pattern: string
  kind: RouteKind
  /** LayoutFamily id. */
  family: string
  params?: RouteParamDef[]
  /**
   * Content collection this route generates one page per entry from. `single`
   * routes default to `posts`; naming a collection makes any route
   * collection-driven — a site's pages and custom post types are per-entry
   * routes too, they just are not called "single".
   *
   * Without a name per route they would all write to (and overwrite) the same
   * collection.
   */
  collection?: string
  /** QueryBinding id feeding this route's list, when it renders one. */
  query?: string
  /**
   * Document title for routes whose pages have no per-page title of their own
   * (a static page, an archive without `QueryPage.title`).
   */
  title?: string
  /**
   * Locale this route serves. A multilingual site has a route per language
   * (`/:slug`, `/en/:slug`) with its own family and query; the emitted page's
   * `lang` comes from here rather than from the project default.
   */
  locale?: string
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
  /** The region is printed only on posts that have this slot filled — see `CHROME_IF_OPEN`. */
  optional?: boolean
  /** The region repeats per list item (terms, authors) — see `CHROME_REPEAT_OPEN`. */
  repeat?: boolean
  /** CSS selector of the slot's container, when one could be determined. */
  selector?: string
  /** Content-model field backing a `custom` slot. */
  field?: string
  /** Date rendering format for `date` slots, as observed on the source site. */
  date_format?: string
}

/**
 * Marks whose name ends in this suffix are inserted as raw HTML instead of
 * being escaped. Escaping stays the default — content-derived text must never
 * be able to break the page — but some themes render a post's full content or
 * a link-bearing excerpt inside a list card, and escaping those prints markup
 * as text (measured on one theme's category page: 48.6).
 */
export const RAW_MARK_SUFFIX = '_html'

/**
 * Repeat block: `<!--@@repeat:NAME@@-->…<!--@@/repeat@@-->`, optionally with a
 * separator — `<!--@@repeat:NAME|, @@-->`. The inner fragment renders once per
 * item of the list named NAME, with per-item marks `item` / `item_index` (and
 * `item_<key>` for object items).
 *
 * Fixed marks (`term0…termN`) cannot express a list whose length varies per
 * post: a template built from a 3-term post leaves stray separators on a
 * 6-term one (measured symptoms: `"Business,"`, `"Releases, Events,"`,
 * `"Automattic, ,"`), and the same class shows up with multiple authors.
 */
export const CHROME_REPEAT_OPEN = '<!--@@repeat:'
export const CHROME_REPEAT_CLOSE = '<!--@@/repeat@@-->'

/**
 * Conditional block: `<!--@@if:NAME@@-->…<!--@@/if@@-->`, negated with
 * `<!--@@if:!NAME@@-->`. The fragment survives only when NAME has a value
 * (non-empty string, non-empty list).
 *
 * Route-parameter variants (`RouteVariantRule`) cannot express this: two posts
 * on the SAME route differ by whether the theme printed a region at all
 * (measured: five posts of one family scored 3.5–84.5, the only difference
 * being a featured block that some posts render and others do not).
 */
export const CHROME_IF_OPEN = '<!--@@if:'
export const CHROME_IF_CLOSE = '<!--@@/if@@-->'

/**
 * Marker a list section's wrapper carries where its items go —
 * `<div class="grid"><!--@@items@@--></div>`.
 */
export const LIST_ITEMS_SLOT = '<!--@@items@@-->'

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
 * Mount point of a component inside chrome: `<!--@@component:ID@@-->`, where
 * ID is a `ComponentDef.id`. The producer replaces the source region (the
 * theme's comment list and form, a contact form) with this marker; the emitter
 * renders the real component there and imports it into the layout, so a
 * runtime component is MOUNTED, not merely emitted as an unused file.
 *
 * Same shape as `CHROME_BODY_SLOT` for the same reasons: a comment survives
 * serialization, renders as nothing if left behind, and can sit at any depth.
 */
export const CHROME_COMPONENT_OPEN = '<!--@@component:'
export const CHROME_COMPONENT_CLOSE = '@@-->'

/** The marker for one component id — `componentSlot('c-comments')`. */
export const componentSlot = (id: string): string => `${CHROME_COMPONENT_OPEN}${id}${CHROME_COMPONENT_CLOSE}`

/**
 * A rendered, asset-rewritten chunk of site chrome the emitter injects verbatim.
 * Positions: `head` lands in `<head>`; `body` is the whole body chrome carrying
 * `CHROME_BODY_SLOT` where content goes (preferred — nesting-safe); the legacy
 * `before_body`/`after_body` pair is composed into a single body with the slot
 * between them (only correct when the content container is top-level).
 *
 * `header` and `footer` lift a region OUT of the body chrome into its own Astro
 * component, rendered as a sibling of the body fragment. They are for the two
 * regions a site actually shares — the masthead and the colophon — and they buy
 * two things one blob cannot: families that carry the same header emit ONE
 * component instead of N copies of the markup, and the nav lives at a single
 * address, which is where a jQuery-free menu replaces the theme's.
 *
 * The producer emits them ONLY after verifying both properties:
 *
 * 1. **Balanced.** The fragment closes every element it opens. Splitting chrome
 *    at an arbitrary point produces halves the parser silently repairs — the
 *    failure that cost a page 36 against 100 and the reason `body` exists.
 * 2. **Outside the content path.** The region sits wholly before (header) or
 *    after (footer) `CHROME_BODY_SLOT` and is not an ancestor of it. A region
 *    that wraps the content cannot be lifted; it belongs in `body`.
 *
 * When either is in doubt, keep everything in one `body` chunk: a single blob
 * is always correct, and this split is an optimisation on top of it.
 */
export interface ChromeChunk {
  id: string
  position: 'head' | 'body' | 'before_body' | 'after_body' | 'header' | 'footer'
  html: string
  /**
   * Shared component name for a `header`/`footer` chunk — `SiteHeader`,
   * `BlogFooter`. Chunks that carry the same name AND the same html collapse
   * into one emitted component; same name with different html gets a suffixed
   * name and a warning, never a silent swap. Default: `SiteHeader`/`SiteFooter`.
   */
  component?: string
}

export interface ComponentPlacement {
  /** ComponentDef id. */
  component: string
  variant?: string
  selector?: string
  /**
   * `QueryBinding.id` whose results fill this region, instead of the cloned
   * markup that was there.
   *
   * The case this exists for: a theme's "recent posts" block sits in the
   * chrome of every article. Cloned, it freezes on the day of the migration —
   * it keeps listing the same posts forever, and nobody notices because it
   * still looks right. Bound to a query it stays current and becomes editable,
   * which is the whole difference between a copy of a site and a site.
   *
   * On the placement rather than on `ComponentDef`, because it is a per-mount
   * fact: one `related` component can be mounted by a post family filtered to
   * the post's category and by an author family filtered to the author. The
   * definition says what the region *is*; the placement says what it shows
   * here — the same split `variant` (card shape) and `selector` (region)
   * already follow.
   */
  query?: string
}

export interface FamilyVariant {
  key: string
  description?: string
}

/**
 * Attributes on the document's root elements, carried verbatim from the source
 * page. Themes hang layout on them — WordPress writes `<body class="wp-singular
 * post-template-default single …">` and scripts add `<html class="js wf-…">`,
 * and the stylesheet's container rules key off exactly those classes. Dropping
 * them costs a correct-content page its entire layout (measured: 36.4 vs 100).
 *
 * Values may carry `@@mark@@` placeholders, so per-page classes (`postid-123`)
 * survive the same filling as chrome.
 *
 * Whether a site needs them is not knowable from one page: the same test that
 * moved 10up 36.4 → 100 moved wptavern 36 → 36, because that theme does not key
 * off body classes. Carry them always.
 */
export interface RootAttrs {
  html?: Record<string, string>
  body?: Record<string, string>
}

export interface LayoutFamily {
  id: string
  name?: string
  kind?: RouteKind
  chrome?: ChromeChunk[]
  /** `<html>` / `<body>` attributes from the source page — see `RootAttrs`. */
  root_attrs?: RootAttrs
  slots?: SlotBinding[]
  components?: ComponentPlacement[]
  css: {
    strategy: CssStrategy
    /**
     * Stylesheets every page of the family loads.
     *
     * Page-builder sites emit CSS per page (`post-11368.css`,
     * `local/global-11368-frontend-*`), so one member's stylesheet set is not
     * the family's: building from a single template page scored 35.6, while
     * the UNION of the members' stylesheets scored 100. Producers put the
     * union here and the per-page remainder on the page itself.
     */
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
  'form',
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
  /**
   * Content model a runtime component talks to — the collection a `form`
   * submits to. A `comments` component needs none: its thread is addressed by
   * the entry of the page it is mounted on.
   */
  model?: string
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
  /** Locale this query is filtered to, on a multilingual site. */
  locale?: string
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

/**
 * Where the full comments export is. A producer writes at most one of
 * `path`, `url` and `inline`; a consumer that meets more than one reads them
 * in that order (see `commentsExportSource`). With none of them the export
 * exists but has no reference yet (a large export with no repository, or
 * one not readable yet): a valid state, nothing to import.
 *
 * The file at `path` or `url` is the export as UTF-8 JSON; `bytes` and
 * `sha256` are taken over its raw bytes, as stored.
 */
export interface HandoffCommentsExport {
  format: typeof COMMENTS_EXPORT_FORMAT
  /**
   * The export as a file in the generated repository: a POSIX path relative
   * to the repository root, in normal form (`comments-export.json`,
   * `data/comments.json`; see `isRepoRelativePath`). The consumer reads it at
   * the same commit it read the handoff from — the commit SHA, not a branch
   * name, which can move between the two reads — with the access it already
   * has to that repository, so a large export in a private repository needs
   * no public URL. A consumer reading a local checkout checks the file is not
   * a symlink (lstat) before reading it.
   */
  path?: string
  /** Where the full export can be fetched… */
  url?: string
  /** …or the export itself, inline, for small sites. */
  inline?: CommentsExport
  /** Size of the file at `path` or `url` in bytes, so a consumer can refuse an oversized one before reading it. */
  bytes?: number
  /** SHA-256 of the file at `path` or `url`, lowercase hex, to check what was read. */
  sha256?: string
}

/** Comments summary + payload pointer on the handoff (capability counts are not enough for intake). */
export interface HandoffComments {
  total: number
  by_status?: Record<string, number>
  types?: Record<string, number>
  export?: HandoffCommentsExport
  threads_closed?: number[]
  unresolved?: Array<{ comment_id: number; post: number; reason: string }>
}

/**
 * A repository-relative POSIX path in normal form: non-empty, relative (no
 * leading `/`), no `.` or `..` or empty segment (so no `./` prefix, no `//`,
 * no trailing `/`), no `.git` segment, no backslash, no scheme or drive (`:`
 * before the first `/`), no control character, and Unicode in NFC. The one
 * form accepted, so two producers cannot spell the same file two ways
 * (`çay` composed or decomposed), and a path can never leave the repository
 * or reach its git internals.
 */
export function isRepoRelativePath(path: unknown): path is string {
  if (typeof path !== 'string' || path === '') return false
  if (path.normalize('NFC') !== path) return false
  if (path.includes('\\') || [...path].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false
  if (/^[^/]*:/.test(path)) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..' && segment.toLowerCase() !== '.git')
}

/** The source a consumer reads the export from, after precedence and validation. */
export type CommentsExportSource =
  | { kind: 'path'; path: string }
  | { kind: 'url'; url: string }
  | { kind: 'inline'; export: CommentsExport }

/**
 * Where to read the comments export from: `path`, else `url`, else `inline`.
 * `path` comes first because it is in the same repository and ref as
 * everything else the handoff describes and needs no public access; `url`
 * wins over `inline` as it always has. A `path` that is not a
 * repository-relative path in normal form is ignored — reading it could
 * leave the repository — and so is a `url` that is not http(s).
 */
export function commentsExportSource(exp: HandoffCommentsExport | undefined): CommentsExportSource | undefined {
  if (!exp) return undefined
  if (isRepoRelativePath(exp.path)) return { kind: 'path', path: exp.path }
  if (typeof exp.url === 'string' && /^https?:\/\//i.test(exp.url)) return { kind: 'url', url: exp.url }
  if (exp.inline && typeof exp.inline === 'object') return { kind: 'inline', export: exp.inline }
  return undefined
}

/** What `validateHandoffCommentsExport` found: `errors` make the pointer wrong, `warnings` weaker than it should be. */
export interface HandoffCommentsExportReport {
  errors: string[]
  warnings: string[]
}

/**
 * What is wrong with a handoff's export pointer, as short sentences. For a
 * producer's own check and a consumer's report — it does not decide what to
 * read (`commentsExportSource` does). A pointer with no source at all is
 * valid (the export has no reference yet) and reports nothing.
 */
export function validateHandoffCommentsExport(exp: HandoffCommentsExport): HandoffCommentsExportReport {
  const issues: string[] = []
  const warnings: string[] = []
  if (exp.format !== COMMENTS_EXPORT_FORMAT) issues.push(`format is not ${COMMENTS_EXPORT_FORMAT}`)
  const given = (['path', 'url', 'inline'] as const).filter((key) => exp[key] !== undefined)
  if (given.length > 1) issues.push(`more than one of path, url, inline is set (${given.join(', ')}); path is read first`)
  if (exp.path !== undefined && !isRepoRelativePath(exp.path)) issues.push('path is not a repository-relative POSIX path in normal form')
  if (exp.url !== undefined && !(typeof exp.url === 'string' && /^https?:\/\//i.test(exp.url))) issues.push('url is not an http(s) URL')
  if (exp.bytes !== undefined && !(Number.isSafeInteger(exp.bytes) && exp.bytes >= 0)) issues.push('bytes is not a non-negative integer')
  if (exp.sha256 !== undefined && !(typeof exp.sha256 === 'string' && /^[0-9a-f]{64}$/.test(exp.sha256))) issues.push('sha256 is not 64 lowercase hex characters')
  if ((exp.bytes !== undefined || exp.sha256 !== undefined) && exp.path === undefined && exp.url === undefined) issues.push('bytes and sha256 describe a file at path or url, and neither is set')
  if (exp.path !== undefined || exp.url !== undefined) {
    if (exp.sha256 === undefined) warnings.push('sha256 is missing — what is read cannot be checked')
    if (exp.bytes === undefined) warnings.push('bytes is missing — an oversized export cannot be refused before reading it')
  }
  return { errors: issues, warnings }
}

// ─── Runtime binding ───
//
// A runtime component (comments, forms) talks to a live service. The static
// site only needs two facts to do that: where the public API lives and which
// project it belongs to. Everything else — the model, the entry, the locale —
// is already on the page that mounts the component.

/**
 * Public API root of the runtime provider plus the project id. `base_url` is
 * the origin (`https://studio.contentrain.io`); components append their own
 * `/api/{forms,comments}/v1/{project_id}/…` paths. No credential travels with
 * it: the public endpoints are unauthenticated by design, and a browser page
 * cannot keep a secret.
 */
export interface RuntimeBinding {
  base_url: string
  project_id: string
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

/**
 * What a standalone page's body is, as far as the migration can carry it.
 *
 * - `html` — markup written in the editor. It travels as content and stays
 *   editable.
 * - `builder_html` — markup a page builder rendered (the builder's own data
 *   is not HTML). It travels as it was rendered: the page looks right, but its
 *   layout is no longer edited in the builder that made it.
 * - `none` — no body; the theme renders the page from other data. Nothing to
 *   carry as content.
 *
 * Counted because they promise different things to the person receiving the
 * site, and a single "pages migrated" number hides which promise was made.
 */
export const PAGE_BODY_KINDS = ['html', 'builder_html', 'none'] as const
export type PageBodyKind = (typeof PAGE_BODY_KINDS)[number]

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
    /**
     * Standalone pages by body kind — see `PageBodyKind`. Every kind is present
     * when the field is, so a zero is a count, not an omission.
     */
    body_kinds?: Record<PageBodyKind, number>
  }
  capabilities: HandoffCapability[]
  /** Present whenever the source had comments — see `HandoffComments`. */
  comments?: HandoffComments
  offers?: HandoffOffer[]
  /** Where the generated site's runtime components were bound, when an offer was fulfilled. */
  runtime?: RuntimeBinding
  notes?: string[]
}
