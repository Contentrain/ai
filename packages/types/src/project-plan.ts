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
  /** Menu slugs (`menus.slug`, as WordPress named them) for the starter's navigation areas — `getMenu(slug)`. */
  menus: { primary: string, footer: string }
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
  domain?: string
  i18n?: boolean
  /** Required for a `plan` collection/document: a text-like field (`validate` refuses a model without one). */
  title_field?: string
  /** Fields of a `plan` model (an imported model's fields are the import's). */
  fields?: Record<string, FieldDef>
  /** How entries of a `plan` model are filled from the source, deterministically. */
  extract?: PlanExtraction[]
}

/**
 * Fill a plan model from builder elements. Each matched element becomes one entry (collection) or
 * the entry (singleton); each field reads a path of the element — the same paths the fact pack's
 * component variance reported. The engine applies it to every page; the model never retypes content.
 */
export interface PlanExtraction {
  /** Builder element (`core/cover`, `elementor/icon-box`) or fact component id (`repeat:1x2y`). */
  from: string
  /** Only on these WordPress entries (ids); all pages when absent. */
  pages?: number[]
  /** Entry id for a matched element: `page-slug`, `page-slug:index`, or a fixed id for a singleton. */
  entryId: string
  /** Model field → `<path>|<prop>` inside the element (`0.1.0|text`, `0.0|src`) or `attr:<name>`. */
  fields: Record<string, string>
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
  variant?: Record<string, string>
  bind: PlanBinding
  /** Interface strings from `ui-strings`: prop → key (`prevLabel: 'pagination.prev'`). */
  labels?: Record<string, string>
}

/**
 * A prop value, never content itself. A small closed set, the same in the mapping table's `from`:
 *
 * - `field:<name>` — a field of the bound entry
 * - `media:<field>` — an image field resolved to the kit's `ImageInput` (`src`, `alt`, `width`, `height`)
 * - `ref:<field>.<target field>` — a field of the entry a relation points at (`ref:category.name`)
 * - `href:self` — the bound entry's own address; `href:<relation field>` — the related entry's, via `site.permalinks`
 * - `ui:<key>` — an interface string of `ui-strings`
 * - `const:<value>` — a fixed value (layout switches, never content)
 */
export type PlanValue = `field:${string}` | `media:${string}` | `ref:${string}` | `href:${string}` | `ui:${string}` | `const:${string}`

export const PLAN_VALUE_PATTERN = /^(?:field:[\w-]+|media:[\w-]+|ref:[\w-]+\.[\w-]+|href:(?:self|[\w-]+)|ui:[\w.-]+|const:.*)$/

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
      if (!m.extract?.length) warnings.push(`plan model ${m.id} has no extraction — its entries start empty`)
    }
    for (const x of m.extract ?? []) {
      for (const [field, path] of Object.entries(x.fields)) {
        if (m.fields && !m.fields[field]) errors.push(`model ${m.id} extraction fills unknown field ${field}`)
        if (!/^attr:[\w.-]+$|^[\d.]+\|(text|href|src|alt|datetime)$/.test(path)) errors.push(`model ${m.id} field ${field}: path ${path} is not "<path>|<prop>" or "attr:<name>"`)
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
    const c = components.get(s.component)
    if (!c) { errors.push(`${at}: component ${s.component} is not declared`); return }
    const b = s.bind
    if ('model' in b && !knownModel(b.model)) errors.push(`${at}: model ${b.model} is not declared`)
    if (b.kind === 'entry' && !route?.source) errors.push(`${at}: binds the route entry but ${route ? 'the route has no source' : 'layout has no entry'}`)
    const values: Record<string, PlanValue> = { ...('props' in b ? b.props : {}), ...(b.kind === 'collection' && !b.into ? b.item : {}) }
    for (const [prop, value] of Object.entries({ ...values, ...(b.kind === 'collection' ? b.item : {}) })) {
      if (!PLAN_VALUE_PATTERN.test(value)) errors.push(`${at}: ${prop} = ${value} is not a plan value (field: media: ref: href: ui: const:)`)
    }
    // A kit component's props are the catalog's; the caller checks them. A site component's are here.
    if (c.props) {
      const bound = new Set([...Object.keys(values), ...Object.keys(s.labels ?? {}), ...('into' in b && b.into ? [b.into] : b.kind === 'menu' ? ['items'] : [])])
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
    r.sections.forEach((s, i) => placement(s, `route ${r.id} section ${i}`, r))
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
  return { errors, warnings }
}
