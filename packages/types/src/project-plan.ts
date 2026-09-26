// ─── Project plan ───
//
// The one holistic decision of a migration, between the fact pack (what the
// WordPress site is) and the writer (the Astro + Contentrain project). It is
// written once per site — by the planner from the facts, the builder mapping
// table and the narrow decisions — and then applied deterministically: models
// and content come from the import, components from the kit or the site
// writer, and every page is composed from placements whose props are bound to
// content. Nothing in a plan is page content: it names where content comes
// from, never copies it. That keeps the cost proportional to the number of
// components, not pages, and keeps Studio edits reaching the site.
//
// `site` mirrors the starter's `src/site.config.ts` field for field, plus the
// three files the deterministic writer also owns: `astro.config` (`url`),
// `redirects.json` and the `@theme` block of `global.css`.
//
// Addresses the starter owns are not plan routes: `/search/`, `/rss.xml`,
// `/404`, `robots.txt` and the sitemap. A plan never emits them.

import { isTitleFieldType, type FieldDef, type ModelKind } from './index.js'

export const PROJECT_PLAN_FORMAT = 'contentrain-project-plan@1'

/** Semantic design roles the kit reads — the starter's `@theme` names without the `--` prefix. */
export const PLAN_TOKEN_ROLES = [
  'color-surface', 'color-surface-muted', 'color-ink', 'color-ink-muted', 'color-line', 'color-accent', 'color-accent-ink',
  'font-sans', 'font-serif', 'font-mono', 'container-prose', 'container-page', 'container-wide', 'radius-card',
  // The source theme's type and shape (theme.json styles): absent means the kit's own values.
  'font-weight-heading', 'font-weight-body', 'text-body', 'leading-body', 'leading-heading', 'radius-control', 'radius-image', 'spacing-gutter',
  // The theme's type scale and rhythm: the site's theme applies them on the kit's markers (`data-kit-*`, `data-cr-part`).
  // `spacing-section` is the distance between two consecutive top-level sections, not a padding: each section gets half.
  'text-nav', 'text-footer', 'text-heading-1', 'text-heading-2', 'text-heading-3', 'spacing-section',
  // The source's link colour where it is not the accent (Hello Elementor: #c36 links, a grey button). Absent: the accent.
  'color-link',
] as const
export type PlanTokenRole = (typeof PLAN_TOKEN_ROLES)[number]

export interface ProjectPlan {
  format: typeof PROJECT_PLAN_FORMAT
  source: PlanSource
  site: PlanSite
  /** The starter's single `BaseLayout`: chrome every route shares. */
  layout: { header?: PlanPlacement, footer?: PlanPlacement }
  models: PlanModel[]
  components: PlanComponent[]
  routes: PlanRoute[]
  /**
   * What becomes of each behavior the fact pack recorded (form, search, embed, accordion, …), one
   * record per fact behavior id — so none is dropped without a reason a reviewer can read.
   */
  behaviors?: PlanBehavior[]
  /** Every decision the plan rests on, with who made it — the audit trail a reviewer reads. */
  decisions?: PlanDecisionRecord[]
}

export interface PlanSource {
  /** The WordPress origin, `https://example.com`. */
  origin: string
  builder: 'gutenberg' | 'elementor' | 'divi' | 'classic'
  /** Hash of the fact pack the plan was made from; a plan is only valid for those facts. */
  facts: string
  /** Version of the builder mapping table the plan applied. */
  mapping?: string
}

// ─── Site ───

/** WordPress-style address pattern: `/blog/:slug/`, `/:path/`; tokens `:slug :path :year :month :day :id`. */
export type PlanPermalink = string

export interface PlanSite {
  /** Public URL the site is built for (`astro.config` `site`). */
  url: string
  title: string
  description?: string
  /** Default locale, short form (`en`, `tr`). */
  locale: string
  permalinks: { post: PlanPermalink, page: PlanPermalink, category: PlanPermalink, tag: PlanPermalink, author: PlanPermalink, blog: PlanPermalink }
  home: { kind: 'posts' } | { kind: 'page', slug: string }
  postsPerPage: number
  /**
   * Menu slugs (`menus.slug`, as WordPress named them) for the starter's navigation areas — `getMenu(slug)`.
   * `footer` lists the footer's menus in the source's order, one column each (at most 4); empty for none.
   * A plan written before 1.25 has one slug, or `'none'`: read it through {@link footerMenusOf}.
   */
  menus: { primary: string, footer: string | string[] }
  /**
   * A single post as the source's single template lays it out: the header parts in their order, links
   * to the previous and next post (`core/post-navigation-link`), and how many other posts a list under
   * it shows (a `core/query` after the content; 0 for none). Absent: the starter's own layout.
   */
  post?: { header: Array<'terms' | 'title' | 'byline' | 'cover'>, adjacent: boolean, more: number }
  /**
   * Post lists (blog index, archives): `cards`, or `full` when the source's query loop shows each post's
   * content; `heading` shows the index's title on the front page. Absent: cards without a heading.
   * `text`: the size of each post's content in a `full` list, when the source's loop sets its own
   * (Twenty Twenty-Five: `has-medium-font-size` on the query's post content); absent, the body size.
   */
  lists?: { display: 'cards' | 'full', heading: boolean, text?: string }
  /**
   * The header and footer as the source's theme prints them, where they differ from the starter's.
   * Every key is optional; absent, the starter's own. `brand`: the site title's size in the header
   * (Hello Elementor: a 2.5rem heading). `tagline`: the header shows the tagline under the title.
   * `copyright`: the footer's line as the source prints it ("All rights reserved"; `{year}` for the
   * current year), instead of "© year Site". `titleLinks`: post titles in lists take the link colour, as the source's do.
   * `navLinks`: so does the header navigation.
   */
  chrome?: { brand?: string, tagline?: boolean, copyright?: string, titleLinks?: boolean, navLinks?: boolean }
  studio?: { baseUrl: string, projectId: string }
  /** `redirects.json`: old path → new path, or with a status other than 301. */
  redirects: Record<string, string | { status: number, destination: string }>
  tokens: PlanTokens
}

export interface PlanTokens {
  /** Values of the kit's roles. A role left out falls back to the starter's default. */
  roles: Partial<Record<PlanTokenRole, string>>
  /** The site's own scale beyond the roles (`--color-brand-2: …`), as `@theme` declarations. */
  extra?: Record<string, string>
  /** WordPress preset slug → value per kind, for `has-<slug>-*` classes left in rich-text bodies. */
  presets?: Partial<Record<'color' | 'font-size' | 'font-family' | 'spacing' | 'shadow', Record<string, string>>>
  /** Fonts to self-host: files are fetched once and served from the project. */
  fonts?: { family: string, weight: string, style: string, unicodeRange?: string, files: string[] }[]
}

// ─── Models ───

/**
 * A content model of the project. Imported models (`posts`, `pages`, `categories`, `tags`, `authors`,
 * `media`, `menus`, `menu-items`, `site`, `ui-strings`) are written by wp-import and only referenced;
 * a `plan` model is new — section content lifted out of builder pages into editable fields.
 */
export interface PlanModel {
  id: string
  kind: ModelKind
  origin: 'import' | 'plan'
  /** What a `plan` model needs to be a Contentrain model: display name, storage domain (`.contentrain/content/<domain>/<id>`), locales, and the field an entry list shows. */
  name?: string
  /** What the model holds, for Studio's model list (the model definition's `description`). */
  description?: string
  domain?: string
  i18n?: boolean
  /** Required for a `plan` collection/document: a text-like field (`validate` refuses a model without one). */
  title_field?: string
  /** Fields of a `plan` model (an imported model's fields are the import's). */
  fields?: Record<string, FieldDef>
  /** How entries of a `plan` model are filled from the source, deterministically. */
  extract?: PlanExtraction[]
  /**
   * A Studio form: submissions from the site's form are saved as entries of this model (a `plan`
   * collection with `i18n: false` whose fields are the source form's fields). Written to the model definition's `form` key.
   */
  form?: PlanFormConfig
}

/**
 * The form settings Studio reads from a model definition's `form` key (Studio's `FormConfig`, kept here
 * so the plan does not depend on Studio). Captcha, honeypot and notifications replace what the form
 * plugin did on WordPress; mail recipients and webhooks are never carried over.
 */
export interface PlanFormConfig {
  enabled: boolean
  /** Accept submissions from the public site (no Studio session). */
  public: boolean
  /** Model fields the public form shows and accepts, in order. */
  exposedFields: string[]
  /** Field → required on the form, where it differs from the model field's own `required`. */
  requiredOverrides?: Record<string, boolean>
  honeypot?: boolean
  captcha?: 'turnstile' | null
  successMessage?: string
  autoApprove?: boolean
  /** Email the workspace owner/admins on every submission. */
  notifications?: boolean
}

/**
 * Fill a plan model from builder elements. Each matched element becomes one entry (collection) or
 * the entry (singleton); each field reads a path of the element — the same paths the fact pack's
 * component variance reported. The engine applies it to every page; the model never retypes content.
 */
export interface PlanExtraction {
  /** Builder element (`core/cover`, `elementor/icon-box`), fact component id (`repeat:1x2y`), or `range:<from>-<to>` (top-level body blocks, for prose runs). */
  from: string
  /** Only on these WordPress entries (ids); all pages when absent. */
  pages?: number[]
  /** Entry id for a matched element: `page-slug`, `page-slug:index`, or a fixed id for a singleton. */
  entryId: string
  /**
   * Apply this builder mapping rule (`<builder>:<match>`, astro-kit `mapping/<builder>.json`) to the element:
   * its props, `into`/`each`/`item` fill the entry's fields of the same names. `fields` then only adds to it.
   */
  rule?: string
  /**
   * The object field of a page singleton this extraction fills (`hero`, `services`): the element is one
   * section, and `rule`'s props / `fields` fill that field's keys instead of the entry's top level.
   */
  field?: string
  /** Model field → `<path>|<prop>` inside the element (`0.1.0|text`, `0.0|src`), `attr:<name>`, or an element expression (`dom:`, `img:`, `link:`, `html:`). */
  fields?: Record<string, string>
}

// ─── Components ───

export interface PlanComponent {
  /**
   * Plan-level name (`Hero`, `PostCard`). A `site` component is written to `src/components/<id>.astro`; a
   * `kit` component is copied by the kit's copy planner to `src/components/kit/<kit-id>/`.
   */
  id: string
  /** Copied from the kit, or written for this site by the writer. Variants are per placement. */
  origin: 'kit' | 'site'
  kit?: { id: string }
  /** A `site` component's props. For a `kit` component the catalog is the source and this stays empty. */
  props?: Record<string, FieldDef>
  /** Fact component ids / builder elements this component stands for. */
  covers?: string[]
  /** For `site` components: what the writer must reproduce (fact template + region paths to look at). */
  brief?: { template: string, regions: string[], notes?: string }
}

// ─── Routes ───

export type PlanRouteKind = 'home' | 'post' | 'page' | 'blog' | 'category' | 'tag' | 'author' | 'custom'

export interface PlanRoute {
  id: string
  kind: PlanRouteKind
  /** Address pattern (a `site.permalinks` value or a custom one). */
  pattern: PlanPermalink
  /** Fact template this route renders like. */
  template: string
  /**
   * Entries the route builds one page each for (`getStaticPaths`); none for a single page. Routes over the
   * same model must not share an entry: disjoint `where: { wp_id: [...] }` sets plus at most one catch-all.
   */
  source?: { model: string, where?: Record<string, unknown>, paginate?: number }
  /**
   * The page model whose object fields hold this page's sections: a singleton (`page-about`), or, for pages
   * that share one layout, a collection that is also the route's `source` (one entry per page). The page's
   * text lives there: the writer does not render the source entry's `body`, and extraction leaves it empty.
   */
  page?: string
  /**
   * `rich-text`: the entry body renders as prose (posts, simple pages).
   * `composed`: the page is the `sections` below, top to bottom.
   */
  body: 'rich-text' | 'composed'
  /** The page body, in document order (chrome is `layout`'s). */
  sections: PlanPlacement[]
}

export interface PlanPlacement {
  /** `PlanComponent.id`. */
  component: string
  /**
   * The section's name on its page (`hero`, `services`, `selected-work`): the page singleton's field for a
   * `section` binding. Unique within a route.
   */
  id?: string
  /**
   * What classified the section: a mapping table's section rule (`<builder>:section:<rule id>`, whoever
   * picked it: rule, cache or JEW), `opus` for a site component written for it, `prose` for the fallback.
   */
  rule?: string
  variant?: Record<string, string>
  bind: PlanBinding
  /** Interface strings from `ui-strings`: prop → key (`prevLabel: 'pagination.prev'`). */
  labels?: Record<string, string>
  /**
   * How wide the section's content runs, as the source block's alignment: `content` for a block without
   * one (the theme's contentSize, `container-prose`), `wide` for `alignwide`/`alignfull` (`container-page`).
   * The section's background spans the page either way. Absent: `wide`.
   */
  width?: 'content' | 'wide'
}

/**
 * A prop value, never content itself. A small closed set, the same in the mapping table's `from`:
 *
 * - `field:<name>` — a field of the bound entry
 * - `media:<field>` — an image field resolved to the kit's `ImageInput` (`src`, `alt`, `width`, `height`)
 * - `ref:<field>.<target field>` — a field of the entry a relation points at (`ref:category.name`)
 * - `href:self` — the bound entry's own address; `href:<relation field>` — the related entry's, via `site.permalinks`
 * - `term:<relation field>` — a related term as `{ label, href }` (the first of a multi-relation; all of them with `into`)
 * - `ui:<key>` — an interface string of `ui-strings`
 * - `site:<field>` — a field of the `site` singleton (`site:title`, `site:logo`)
 * - `menu:primary|footer` — the items of the menu `site.menus` names for that area (the first footer menu)
 * - `page:base|current|total|breadcrumb` — what the route knows about the page being built
 * - `const:<value>` — a layout switch, never content: `true`, `false`, a number, or a lowercase identifier
 *   (`const:contact`); anything that reads like text is refused, so page copy cannot be baked into code
 *
 * The builder mapping tables use the same set plus element expressions; one placement can mix them
 * (a header's `siteName` from `site:title`, its `items` from `menu:primary`).
 */
export type PlanValue = `field:${string}` | `media:${string}` | `ref:${string}` | `href:${string}` | `term:${string}` | `ui:${string}` | `site:${string}` | `menu:${string}` | `page:${string}` | `const:${string}`

export const PLAN_VALUE_PATTERN = /^(?:field:[\w-]+|media:[\w-]+|ref:[\w-]+\.[\w-]+|href:(?:self|[\w-]+)|term:[\w-]+|ui:[\w.-]+|site:[\w-]+|menu:(?:primary|footer)|page:(?:base|current|total|breadcrumb)|const:(?:true|false|-?\d+(?:\.\d+)?|[a-z][a-z0-9_-]{0,31}))$/

/** Where a placement's props come from. */
export type PlanBinding =
  /** The route's own entry. */
  | { kind: 'entry', props: Record<string, PlanValue> }
  /** One entry of a model (a singleton, or a fixed entry id). */
  | { kind: 'model', model: string, entry?: string, props: Record<string, PlanValue> }
  /**
   * A list: a query over a collection. With `into`, the list fills that one array prop (`card-grid.items`,
   * `faq.items`) and `item` maps each element; without it, the component repeats once per entry (`post-card`)
   * and `item` maps its props.
   */
  | { kind: 'collection', model: string, where?: Record<string, unknown>, sort?: string, limit?: number, into?: string, item: Record<string, PlanValue>, props?: Record<string, PlanValue> }
  /** A menu by slug; its items fill `into` (default `items`). */
  | { kind: 'menu', menu: string, into?: string, props?: Record<string, PlanValue> }
  /** Only fixed values and labels. */
  | { kind: 'static', props: Record<string, PlanValue> }
  /**
   * A page section: the object field `field` of a singleton (or of entry `entry`, or of the route's own entry
   * when `model` is the route's template collection) feeds the component. Its keys are the component's
   * content props in snake_case (`cta_label` → `ctaLabel`, DECISIONS §7b); the view passes each one
   * explicitly. `props` adds fixed values (a variant-like setting, a label) after the field's.
   */
  | { kind: 'section', model: string, entry?: string, field: string, props?: Record<string, PlanValue> }

// ─── Behaviors ───

/**
 * - `component` — a placed component carries it (`component`: a `PlanComponent` id). An element the
 *   mapping already turned into a section (core/details → faq) points at that section's component; it
 *   is not placed a second time.
 * - `starter` — the starter already provides it (`feature`: site search is Pagefind on `/search/`).
 * - `prose` — it sits in a rich-text body and the prose renderer handles it (an oEmbed in a post).
 * - `drop` — deliberately not reproduced; `reason` says why.
 * - `needs_review` — no counterpart yet (an exit-intent popup, a payment form); `reason` says what a person must decide.
 */
export type PlanBehaviorOutcome = 'component' | 'starter' | 'prose' | 'drop' | 'needs_review'

export const PLAN_STARTER_FEATURES = ['search'] as const
export type PlanStarterFeature = (typeof PLAN_STARTER_FEATURES)[number]

export interface PlanBehavior {
  /** The fact pack's behavior id (`form:3fa9c21e`, `embed:0c1d2e3f`, `nav:t2`). */
  fact: string
  outcome: PlanBehaviorOutcome
  /** `PlanComponent` id, for `component`. */
  component?: string
  /** Starter feature, for `starter`. */
  feature?: PlanStarterFeature
  /** The model a form's submissions are saved to (a plan model with `form`). */
  model?: string
  /** `<code>: <sentence>`, required for `drop` and `needs_review` (`form-feature: Studio forms has no payment step`). */
  reason?: string
}

export const PLAN_BEHAVIOR_REASON = /^[a-z][a-z0-9-]*: \S.*$/

// ─── Decisions ───

export interface PlanDecisionRecord {
  /** The fact decision id (`field_type:repeat:1x2y:0.1.0:text`) or a plan-level question. */
  id: string
  answer: string
  by: 'rule' | 'cache' | 'jew' | 'haiku' | 'opus' | 'fallback' | 'human'
  confidence?: number
}

// ─── Validation ───

export interface ProjectPlanReport { errors: string[], warnings: string[] }

const PERMALINK = /^\/(?:[^/\s]+\/)*$/
const IMPORTED_MODELS = new Set(['posts', 'pages', 'categories', 'tags', 'authors', 'media', 'menus', 'menu-items', 'site', 'ui-strings'])

/**
 * Structural checks a plan must pass before anything is written: every reference resolves (routes →
 * components → models), permalinks are well-formed, kit components carry a kit id, plan models carry
 * their fields. Kit catalog and fact checks (does the kit id exist, does the template exist) belong to
 * the caller, which holds those documents.
 */
/** The footer's menus as a list: an older plan's single slug is one menu, its `'none'` is none. */
export function footerMenusOf(site: Pick<PlanSite, 'menus'>): string[] {
  const footer = site.menus.footer
  if (typeof footer === 'string') return footer === 'none' || footer === '' ? [] : [footer]
  return [...footer]
}

/** A font size the starter writes into a style: a length, or a `clamp()`/`calc()`/`min()`/`max()` of lengths (a theme's fluid size). */
const CSS_LENGTH = /^(?!.*url\()(?:\d+(?:\.\d+)?(?:px|rem|em|%)|(?:clamp|calc|min|max)\([\d\s.,+*/()a-z%-]+\))$/

/**
 * How many object levels a field nests: 0 for a scalar or a list of scalars, 1 for an object of scalars,
 * 2 for an object holding a list of objects (`hero.actions[]`). A list adds no level of its own.
 */
export function fieldDepth(field: FieldDef): number {
  const children = [...Object.values(field.fields ?? {}), ...(typeof field.items === 'object' ? [field.items] : [])]
  return (field.type === 'object' ? 1 : 0) + Math.max(0, ...children.map(fieldDepth))
}

/**
 * Placement `rule`: a mapping table's section rule (`elementor:section:hero.split`) or element rule
 * (`gutenberg:element:core/details`, `gutenberg:element:core/template-part:header`), a site component
 * (`opus`), or the rich-text fallback.
 */
export const PLAN_SECTION_RULE = /^(?:(?:gutenberg|elementor|divi|classic):(?:section:[a-z][\w.-]*|element:[a-z][\w./:-]*)|opus|prose)$/

/** A content prop's field name in a section object: the prop in snake_case (`ctaLabel` → `cta_label`). */
export function sectionFieldName(prop: string): string {
  return prop.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
}

export function validateProjectPlan(plan: ProjectPlan): ProjectPlanReport {
  const errors: string[] = []
  const warnings: string[] = []
  if (plan.format !== PROJECT_PLAN_FORMAT) errors.push(`format is not ${PROJECT_PLAN_FORMAT}`)
  if (!/^https?:\/\/[^/]+$/.test(plan.source?.origin ?? '')) errors.push('source.origin is not an http(s) origin without a path')
  const site = plan.site
  for (const [key, value] of Object.entries(site?.permalinks ?? {})) {
    if (!PERMALINK.test(value)) errors.push(`site.permalinks.${key} must start and end with "/" (${value})`)
  }
  if (!Number.isSafeInteger(site?.postsPerPage) || site.postsPerPage < 1) errors.push('site.postsPerPage is not a positive integer')
  if (site?.post) {
    const parts = site.post.header ?? []
    if (parts.some(part => !['terms', 'title', 'byline', 'cover'].includes(part)) || new Set(parts).size !== parts.length) errors.push('site.post.header lists a part twice or one the starter does not have')
    if (!Number.isSafeInteger(site.post.more) || site.post.more < 0 || site.post.more > 20) errors.push('site.post.more is not a count from 0 to 20')
  }
  if (site?.lists && !['cards', 'full'].includes(site.lists.display)) errors.push(`site.lists.display ${site.lists.display} is not cards or full`)
  if (site?.lists?.text !== undefined && !CSS_LENGTH.test(site.lists.text)) errors.push(`site.lists.text ${site.lists.text} is not a CSS size`)
  const chrome = site?.chrome
  if (chrome?.brand !== undefined && !CSS_LENGTH.test(chrome.brand)) errors.push(`site.chrome.brand ${chrome.brand} is not a CSS size`)
  if (chrome?.tagline !== undefined && typeof chrome.tagline !== 'boolean') errors.push('site.chrome.tagline is not a boolean')
  if (chrome?.titleLinks !== undefined && typeof chrome.titleLinks !== 'boolean') errors.push('site.chrome.titleLinks is not a boolean')
  if (chrome?.navLinks !== undefined && typeof chrome.navLinks !== 'boolean') errors.push('site.chrome.navLinks is not a boolean')
  if (chrome?.copyright !== undefined && (typeof chrome.copyright !== 'string' || !chrome.copyright.trim() || chrome.copyright.length > 200 || /[<>]/.test(chrome.copyright))) errors.push('site.chrome.copyright is not a line of plain text (1–200 characters, no markup)')
  const footer = site?.menus?.footer
  if (typeof footer === 'string') {
    if (footer === '') errors.push('site.menus.footer has an empty menu slug')
  } else if (!Array.isArray(footer)) errors.push('site.menus.footer is not a menu slug or a list of them')
  else {
    if (footer.length > 4) errors.push(`site.menus.footer has ${footer.length} menus; the footer takes at most 4`)
    if (footer.some(slug => typeof slug !== 'string' || slug === '')) errors.push('site.menus.footer has an empty menu slug')
    if (new Set(footer).size !== footer.length) errors.push('site.menus.footer names a menu twice')
  }
  for (const [from, to] of Object.entries(site?.redirects ?? {})) {
    if (!from.startsWith('/')) errors.push(`redirect ${from} does not start with "/"`)
    const status = typeof to === 'string' ? 301 : to.status
    if (![301, 302, 307, 308, 410].includes(status)) errors.push(`redirect ${from} has status ${status}`)
  }
  for (const role of Object.keys(site?.tokens?.roles ?? {})) {
    if (!(PLAN_TOKEN_ROLES as readonly string[]).includes(role)) errors.push(`tokens.roles.${role} is not a kit role`)
  }

  const models = new Map<string, PlanModel>()
  for (const m of plan.models ?? []) {
    if (models.has(m.id)) errors.push(`model ${m.id} is declared twice`)
    models.set(m.id, m)
    if (m.origin === 'import' && !IMPORTED_MODELS.has(m.id)) warnings.push(`model ${m.id} is marked imported but wp-import does not write it`)
    if (m.origin === 'plan') {
      if (!m.fields) errors.push(`plan model ${m.id} has no fields`)
      if (!m.name || !m.domain) errors.push(`plan model ${m.id} needs name and domain`)
      if (m.kind === 'collection' || m.kind === 'document') {
        const title = m.title_field ? m.fields?.[m.title_field] : undefined
        if (!m.title_field) errors.push(`plan model ${m.id} has no title_field`)
        else if (!title) errors.push(`plan model ${m.id}: title_field ${m.title_field} is not one of its fields`)
        else if (!isTitleFieldType(title.type)) errors.push(`plan model ${m.id}: title_field ${m.title_field} is ${title.type}, not a text-like type`)
      }
      if (!m.extract?.length && !m.form) warnings.push(`plan model ${m.id} has no extraction — its entries start empty`)
    }
    if (m.form) {
      if (m.origin !== 'plan' || m.kind !== 'collection') errors.push(`model ${m.id}: a form model must be a plan collection`)
      // Unset means localized for a Contentrain model; submissions have no locale to be translated into.
      if (m.i18n !== false) errors.push(`model ${m.id}: a form model must be i18n: false (Studio writes submissions in the default locale)`)
      if (!m.form.exposedFields.length) errors.push(`model ${m.id}: form exposes no fields`)
      for (const field of [...m.form.exposedFields, ...Object.keys(m.form.requiredOverrides ?? {})]) {
        if (m.fields && !m.fields[field]) errors.push(`model ${m.id}: form field ${field} is not a model field`)
      }
      if (m.form.captcha !== undefined && m.form.captcha !== null && m.form.captcha !== 'turnstile') errors.push(`model ${m.id}: form captcha ${String(m.form.captcha)} is not turnstile`)
    }
    for (const x of m.extract ?? []) {
      if (!x.rule && !x.fields) errors.push(`model ${m.id} extraction from ${x.from} has neither rule nor fields`)
      if (x.field !== undefined && m.fields && m.fields[x.field]?.type !== 'object') errors.push(`model ${m.id} extraction from ${x.from} fills ${x.field}, which is not an object field`)
      if (x.rule && !/^(gutenberg|elementor|divi|classic):[\w./:-]+$/.test(x.rule)) errors.push(`model ${m.id} extraction rule ${x.rule} is not <builder>:<match>`)
      const target = x.field !== undefined ? m.fields?.[x.field]?.fields : m.fields
      for (const [field, path] of Object.entries(x.fields ?? {})) {
        if (target && !target[field]) errors.push(`model ${m.id} extraction fills unknown field ${field}`)
        if (!/^attr:[\w.-]+$|^[\d.]+\|(text|href|src|alt|datetime)$|^(?:dom|img|link|html):[^@]*(?:@[\w-]+)?$/.test(path)) errors.push(`model ${m.id} field ${field}: path ${path} is not "<path>|<prop>", "attr:<name>" or an element expression`)
      }
    }
  }
  const knownModel = (id: string) => models.has(id) || IMPORTED_MODELS.has(id)

  const components = new Map<string, PlanComponent>()
  for (const c of plan.components ?? []) {
    if (components.has(c.id)) errors.push(`component ${c.id} is declared twice`)
    components.set(c.id, c)
    if (!/^[A-Z][A-Za-z0-9]*$/.test(c.id)) errors.push(`component ${c.id} is not a PascalCase name`)
    if (c.origin === 'kit' && !c.kit?.id) errors.push(`kit component ${c.id} names no kit id`)
    if (c.origin === 'site' && !c.props) errors.push(`site component ${c.id} declares no props`)
    if (c.origin === 'site' && !c.brief) warnings.push(`site component ${c.id} has no brief for the writer`)
  }

  const placement = (s: PlanPlacement, at: string, route?: PlanRoute) => {
    if (s.width !== undefined && s.width !== 'content' && s.width !== 'wide') errors.push(`${at}: width ${s.width as string} is not content or wide`)
    const c = components.get(s.component)
    if (!c) { errors.push(`${at}: component ${s.component} is not declared`); return }
    const b = s.bind
    if ('model' in b && !knownModel(b.model)) errors.push(`${at}: model ${b.model} is not declared`)
    if (b.kind === 'entry' && !route?.source) errors.push(`${at}: binds the route entry but ${route ? 'the route has no source' : 'layout has no entry'}`)
    if (s.id !== undefined && !/^[a-z][a-z0-9-]*$/.test(s.id)) errors.push(`${at}: id ${s.id} is not kebab-case`)
    if (s.rule !== undefined && !PLAN_SECTION_RULE.test(s.rule)) errors.push(`${at}: rule ${s.rule} is not <builder>:section:<id>, <builder>:element:<match>, opus or prose`)
    if (b.kind === 'section') {
      const m = models.get(b.model)
      const field = m?.fields?.[b.field]
      // A template route's sections read the route's own entry: its page collection is the route source.
      const ownEntry = route?.page === b.model && route.source?.model === b.model
      if (m && m.origin === 'plan' && m.kind !== 'singleton' && b.entry === undefined && !ownEntry) errors.push(`${at}: section of ${b.model} names no entry and ${b.model} is neither a singleton nor this route's page`)
      if (m?.fields && !field) errors.push(`${at}: ${b.model} has no field ${b.field}`)
      else if (field && field.type !== 'object') errors.push(`${at}: ${b.model}.${b.field} is ${field.type}, not an object`)
      else if (field && fieldDepth(field) > 2) errors.push(`${at}: ${b.model}.${b.field} nests deeper than 2 (an object inside a list item's object)`)
      const fieldOf = new Map(Object.keys(c.props ?? {}).map(prop => [sectionFieldName(prop), prop]))
      if (c.props && field?.fields) for (const key of Object.keys(field.fields)) if (!fieldOf.has(key)) errors.push(`${at}: ${c.id} has no prop for field ${b.model}.${b.field}.${key} (fields are the props in snake_case)`)
    }
    const values: Record<string, PlanValue> = { ...('props' in b ? b.props : {}), ...(b.kind === 'collection' && !b.into ? b.item : {}) }
    for (const [prop, value] of Object.entries({ ...values, ...(b.kind === 'collection' ? b.item : {}) })) {
      if (!PLAN_VALUE_PATTERN.test(value)) errors.push(`${at}: ${prop} = ${value} is not a plan value (field: media: ref: href: term: ui: site: menu: page: const:)`)
    }
    // A kit component's props are the catalog's; the caller checks them. A site component's are here.
    if (c.props) {
      const byField = new Map(Object.keys(c.props).map(prop => [sectionFieldName(prop), prop]))
      const spread = b.kind === 'section' ? Object.keys(models.get(b.model)?.fields?.[b.field]?.fields ?? {}).flatMap(key => byField.get(key) ?? []) : []
      const bound = new Set([...Object.keys(values), ...spread, ...Object.keys(s.labels ?? {}), ...('into' in b && b.into ? [b.into] : b.kind === 'menu' ? ['items'] : [])])
      for (const prop of bound) if (!c.props[prop]) errors.push(`${at}: ${c.id} has no prop ${prop}`)
      for (const [prop, def] of Object.entries(c.props)) if (def.required && !bound.has(prop)) errors.push(`${at}: required prop ${c.id}.${prop} is not bound`)
    }
  }
  if (plan.layout?.header) placement(plan.layout.header, 'layout header')
  if (plan.layout?.footer) placement(plan.layout.footer, 'layout footer')

  const routeIds = new Set<string>()
  const byModel = new Map<string, PlanRoute[]>()
  for (const r of plan.routes ?? []) {
    if (routeIds.has(r.id)) errors.push(`route ${r.id} is declared twice`)
    routeIds.add(r.id)
    if (!PERMALINK.test(r.pattern)) errors.push(`route ${r.id}: pattern ${r.pattern} must start and end with "/"`)
    if (r.source) {
      if (!knownModel(r.source.model)) errors.push(`route ${r.id}: source model ${r.source.model} is not declared`)
      ;(byModel.get(r.source.model) ?? byModel.set(r.source.model, []).get(r.source.model)!).push(r)
    }
    if (r.body === 'composed' && !r.sections.length) warnings.push(`route ${r.id} is composed but has no sections`)
    if (r.page !== undefined) {
      const page = models.get(r.page)
      if (!page) errors.push(`route ${r.id}: page ${r.page} is not declared`)
      // A collection of pages sharing one layout is a template route: each entry is one page.
      else if (page.kind === 'collection' ? r.source?.model !== r.page : page.kind !== 'singleton') errors.push(`route ${r.id}: page ${r.page} is a ${page.kind}; a page is a singleton, or a collection that is the route's source`)
      if (r.body !== 'composed') errors.push(`route ${r.id}: a page model needs body composed`)
    }
    const sectionIds = new Set<string>()
    for (const s of r.sections) {
      if (s.id === undefined) continue
      if (sectionIds.has(s.id)) errors.push(`route ${r.id}: section id ${s.id} is used twice`)
      sectionIds.add(s.id)
    }
    r.sections.forEach((s, i) => placement(s, `route ${r.id} section ${i}`, r))
  }
  // Two routes on one pattern build one address twice, unless they split one model's entries by `where`.
  const byPattern = new Map<string, PlanRoute[]>()
  for (const r of plan.routes ?? []) (byPattern.get(r.pattern) ?? byPattern.set(r.pattern, []).get(r.pattern)!).push(r)
  for (const [pattern, routes] of byPattern) {
    if (routes.length < 2) continue
    const sources = new Set(routes.map(r => r.source?.model ?? ''))
    const split = sources.size === 1 && !sources.has('') && routes.filter(r => !r.source?.where).length <= 1
    if (!split) warnings.push(`routes ${routes.map(r => r.id).join(', ')} share the pattern ${pattern}`)
  }
  // One address per entry: routes over one model split it by disjoint wp_id sets plus at most one catch-all.
  for (const [model, routes] of byModel) {
    if (routes.length < 2) continue
    const catchAll = routes.filter(r => !r.source?.where || Object.keys(r.source.where).length === 0)
    if (catchAll.length > 1) errors.push(`model ${model}: routes ${catchAll.map(r => r.id).join(', ')} are all catch-alls`)
    const seen = new Map<unknown, string>()
    for (const r of routes) {
      const ids = r.source?.where?.wp_id
      if (r.source?.where && ids === undefined) warnings.push(`route ${r.id}: where without wp_id — overlap with other ${model} routes cannot be checked`)
      for (const id of Array.isArray(ids) ? ids : ids === undefined ? [] : [ids]) {
        const other = seen.get(id)
        if (other) errors.push(`model ${model}: entry ${String(id)} is in routes ${other} and ${r.id}`)
        else seen.set(id, r.id)
      }
    }
  }
  if (!plan.routes?.some(r => r.kind === 'home')) errors.push('no home route')

  const behaviorIds = new Set<string>()
  for (const b of plan.behaviors ?? []) {
    const at = `behavior ${b.fact}`
    if (behaviorIds.has(b.fact)) errors.push(`${at} is planned twice`)
    behaviorIds.add(b.fact)
    if (b.outcome === 'component') {
      if (!b.component) errors.push(`${at}: outcome component names no component`)
      else if (!components.has(b.component)) errors.push(`${at}: component ${b.component} is not declared`)
    }
    if (b.outcome === 'starter' && !(PLAN_STARTER_FEATURES as readonly string[]).includes(b.feature ?? '')) errors.push(`${at}: starter feature ${String(b.feature)} is not one of ${PLAN_STARTER_FEATURES.join(', ')}`)
    if ((b.outcome === 'drop' || b.outcome === 'needs_review') && !PLAN_BEHAVIOR_REASON.test(b.reason ?? '')) errors.push(`${at}: ${b.outcome} needs a reason "<code>: <sentence>"`)
    if (b.model) {
      const m = models.get(b.model)
      if (!m) errors.push(`${at}: model ${b.model} is not declared`)
      else if (!m.form) errors.push(`${at}: model ${b.model} is not a form model`)
    }
  }
  return { errors, warnings }
}
