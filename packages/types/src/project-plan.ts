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

import type { FieldDef, FieldType, ModelKind } from './index.js'

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
  /** Menu entry ids (in the `menus` model) for the starter's navigation areas. */
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
  /** Component name in the project (`Hero`, `PostCard`) — the file `src/components/<id>.astro`. */
  id: string
  /** Copied from the kit (with a variant), or written for this site by the writer. */
  origin: 'kit' | 'site'
  kit?: { id: string, variant?: Record<string, string> }
  props: Record<string, { type: FieldType, required?: boolean, description?: string }>
  /** Fact component ids / builder elements this component stands for. */
  covers?: string[]
  /** For `site` components: what the writer must reproduce (fact template + region paths to look at). */
  brief?: { template: string, regions: string[], notes?: string }
}

// ─── Routes ───

export type PlanRouteKind = 'home' | 'post' | 'page' | 'blog' | 'category' | 'tag' | 'author' | 'custom' | 'not-found'

export interface PlanRoute {
  id: string
  kind: PlanRouteKind
  /** Address pattern (a `site.permalinks` value or a custom one). */
  pattern: PlanPermalink
  /** Fact template this route renders like. */
  template: string
  /** Entries the route builds one page each for (`getStaticPaths`); none for a single page. */
  source?: { model: string, where?: Record<string, unknown>, paginate?: number }
  /**
   * `rich-text`: the entry body renders as prose (posts, simple pages).
   * `composed`: the page is the `sections` below, top to bottom.
   */
  body: 'rich-text' | 'composed'
  /** Page chrome and composition, in document order. `header`/`footer` placements are the layout's. */
  sections: PlanPlacement[]
}

export interface PlanPlacement {
  /** `PlanComponent.id`. */
  component: string
  region?: string
  variant?: Record<string, string>
  bind: PlanBinding
}

/** Where a placement's props come from. Values are field names of the bound entry, never content. */
export type PlanBinding =
  /** The route's own entry: prop → field (`title`, `featured_image`, `content`). */
  | { kind: 'entry', props: Record<string, string> }
  /** One entry of a model (a singleton, or a fixed entry). */
  | { kind: 'model', model: string, entry?: string, props: Record<string, string> }
  /** A list: a query over a collection, each item's props from its fields. */
  | { kind: 'collection', model: string, where?: Record<string, unknown>, sort?: string, limit?: number, item: Record<string, string> }
  /** A menu of the `menus` model. */
  | { kind: 'menu', menu: string }
  /** Interface strings of a dictionary: prop → key. */
  | { kind: 'dictionary', model: string, props: Record<string, string> }
  /** Fixed props (layout switches, never content). */
  | { kind: 'static', props: Record<string, string | number | boolean> }

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
    if (m.origin === 'plan' && !m.fields) errors.push(`plan model ${m.id} has no fields`)
    if (m.origin === 'plan' && !m.extract?.length) warnings.push(`plan model ${m.id} has no extraction — its entries start empty`)
    if (m.origin === 'import' && !IMPORTED_MODELS.has(m.id)) warnings.push(`model ${m.id} is marked imported but wp-import does not write it`)
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
    if (c.origin === 'site' && !c.brief) warnings.push(`site component ${c.id} has no brief for the writer`)
  }

  const routeIds = new Set<string>()
  for (const r of plan.routes ?? []) {
    if (routeIds.has(r.id)) errors.push(`route ${r.id} is declared twice`)
    routeIds.add(r.id)
    if (!PERMALINK.test(r.pattern)) errors.push(`route ${r.id}: pattern ${r.pattern} must start and end with "/"`)
    if (r.source && !knownModel(r.source.model)) errors.push(`route ${r.id}: source model ${r.source.model} is not declared`)
    if (r.body === 'composed' && !r.sections.some(s => s.region !== 'header' && s.region !== 'footer')) warnings.push(`route ${r.id} is composed but has no body sections`)
    r.sections.forEach((s, i) => {
      const at = `route ${r.id} section ${i}`
      const c = components.get(s.component)
      if (!c) { errors.push(`${at}: component ${s.component} is not declared`); return }
      const b = s.bind
      if ('model' in b && !knownModel(b.model)) errors.push(`${at}: model ${b.model} is not declared`)
      if (b.kind === 'entry' && !r.source) errors.push(`${at}: binds the route entry but the route has no source`)
      const props = b.kind === 'collection' ? b.item : b.kind === 'menu' ? {} : b.props
      for (const prop of Object.keys(props)) if (!c.props[prop]) errors.push(`${at}: ${c.id} has no prop ${prop}`)
      for (const [prop, def] of Object.entries(c.props)) {
        if (def.required && b.kind !== 'menu' && !(prop in props)) errors.push(`${at}: required prop ${c.id}.${prop} is not bound`)
      }
    })
  }
  if (!plan.routes?.some(r => r.kind === 'home')) errors.push('no home route')
  return { errors, warnings }
}
