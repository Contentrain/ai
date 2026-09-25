// Composed pages as Astro views, from the plan's placements. Each composed
// page route becomes `src/views/composed/<Name>.astro`: its sections in order,
// every prop read from content the way the placement binds it — a section
// entry, the page itself, a query, a menu, the site singleton or an interface
// string. Written as plain, readable Astro, the same code a developer would
// write by hand, so the site can be edited after the migration without the
// writer.
//
// Routes the starter already builds (post and page bodies, the posts index,
// term archives) generate nothing; a placement this generator cannot express
// is reported, not guessed, and left to the site writer.

import type { KitCatalog, KitComponent } from '@contentrain/astro-kit'
import type { FieldDef, ModelDefinition, PlanBinding, PlanComponent, PlanPlacement, PlanRoute, PlanValue, ProjectPlan } from '@contentrain/types'
import { collectionName } from './schema.js'

export class CodegenError extends Error {}

/** Sort key of an import line: `astro:` modules first, then relative imports by path. */
const importKey = (line: string) => line.slice(line.lastIndexOf(' from ') + 7).replace(/^astro:/, ' ')

export interface ComposedView {
  route: string
  /** Component name and file, under `src/views/composed/`. */
  name: string
  file: string
  source: string
  /** WordPress ids of the pages this view renders. */
  wpIds: number[]
}

export interface RoutePlanOutcome {
  views: ComposedView[]
  /** Routes the starter's own views already render as the plan describes. */
  covered: string[]
  /** Routes (or placements) that need the site writer, with the reason. */
  unsupported: Array<{ route: string, reason: string }>
}

/** Pascal-case name of a kit id: `card-grid` → `CardGrid`. */
export const pascal = (id: string): string => id.split(/[^a-z0-9]+/i).filter(Boolean).map(part => part[0]!.toUpperCase() + part.slice(1)).join('')

const sq = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const prop = (name: string) => (/^[a-z_$][\w$]*$/i.test(name) ? name : sq(name))

interface Context {
  plan: ProjectPlan
  catalog: KitCatalog
  models: ReadonlyMap<string, ModelDefinition>
}

/** Where a placement's component comes from: a kit copy or a site component. */
function componentOf(ctx: Context, id: string): { name: string, importPath: string, kit?: KitComponent } {
  const component: PlanComponent | undefined = ctx.plan.components.find(c => c.id === id)
  if (!component) throw new CodegenError(`component ${id} is not declared`)
  if (component.origin === 'kit') {
    const kitId = component.kit!.id
    const kit = ctx.catalog.components.find(c => c.id === kitId)
    if (!kit) throw new CodegenError(`kit has no component ${kitId}`)
    return { name: pascal(kitId), importPath: `../../components/kit/${kitId}/${pascal(kitId)}.astro`, kit }
  }
  return { name: component.id, importPath: `../../components/site/${component.id}.astro` }
}

/** The relation target model of a field, when it names one. */
function relationTarget(ctx: Context, model: string, field: string): { target: string, many: boolean } | undefined {
  const def: FieldDef | undefined = ctx.models.get(model)?.fields?.[field]
  if (!def || (def.type !== 'relation' && def.type !== 'relations') || typeof def.model !== 'string') return undefined
  return { target: def.model, many: def.type === 'relations' }
}

/** One source of values: an expression for the entry data, the entry itself, and its model. */
interface Scope { data: string, entry: string, model: string | undefined }

class View {
  imports = new Map<string, string>()
  needs = new Set<'getEntry' | 'getCollection' | 'getStrings' | 'getSite' | 'getMenu' | 'siteConfig' | 'pages' | 'getPosts' | 'imageOf' | 'postHref' | 'pageHref' | 'termHref' | 'authorHref' | 'byId'>()
  lines: string[] = []
  body: string[] = []
  counter = 0

  constructor(readonly ctx: Context, readonly route: PlanRoute) {}

  local(prefix: string): string {
    return `${prefix}${this.counter++}`
  }

  /** A single-entry relation → the entry, or undefined. `many` relations take their first. */
  related(scope: Scope, field: string): { expr: string, model: string } {
    const relation = scope.model ? relationTarget(this.ctx, scope.model, field) : undefined
    if (!relation) throw new CodegenError(`${scope.model ?? 'entry'}.${field} is not a relation to one model`)
    this.needs.add('getEntry')
    const ref = relation.many ? `${scope.data}.${field}[0]` : `${scope.data}.${field}`
    return { expr: `(${ref} ? await getEntry(${ref}) : undefined)`, model: relation.target }
  }

  /** The address of an entry of `model`. */
  href(entry: string, model: string): string {
    if (model === 'posts') { this.needs.add('postHref'); return `postHref(${entry})` }
    if (model === 'pages') { this.needs.add('pageHref'); this.needs.add('pages'); return `pageHref(${entry}, pages)` }
    if (model === 'authors') { this.needs.add('authorHref'); return `authorHref(${entry})` }
    if (model === 'categories' || model === 'tags') {
      this.needs.add('termHref')
      this.needs.add('byId')
      return `termHref(${sq(model === 'tags' ? 'tag' : 'category')}, ${entry}, await byId(${sq(model)}))`
    }
    throw new CodegenError(`entries of ${model} have no address`)
  }

  /** A plan value → a TypeScript expression (it may `await`; frontmatter allows it). */
  value(value: PlanValue, scope: Scope | undefined): string {
    const colon = value.indexOf(':')
    const kind = value.slice(0, colon)
    const arg = value.slice(colon + 1)
    const need = () => {
      if (!scope) throw new CodegenError(`${value} needs an entry, and this placement binds none`)
      return scope
    }
    switch (kind) {
      case 'field': return `${need().data}.${arg}`
      case 'media': {
        const s = need()
        const { expr } = this.related(s, arg)
        this.needs.add('imageOf')
        const media = this.local('media')
        this.lines.push(`const ${media} = ${expr}`)
        return `(${media} ? imageOf(${media}) : undefined)`
      }
      case 'ref': {
        const [field, target] = arg.split('.') as [string, string]
        return `${this.related(need(), field).expr}?.data.${target}`
      }
      case 'href': {
        const s = need()
        if (arg === 'self') return s.model ? this.href(s.entry, s.model) : 'Astro.url.pathname'
        const { expr, model } = this.related(s, arg)
        const target = this.local('link')
        this.lines.push(`const ${target} = ${expr}`)
        return `(${target} ? ${this.href(target, model)} : undefined)`
      }
      case 'term': {
        const s = need()
        const { expr, model } = this.related(s, arg)
        const term = this.local('term')
        this.lines.push(`const ${term} = ${expr}`)
        return `(${term} ? { label: ${term}.data.name, href: ${this.href(term, model)} } : undefined)`
      }
      case 'ui': this.needs.add('getStrings'); return `t(${sq(arg)})`
      case 'site': this.needs.add('getSite'); return `site.${arg}`
      case 'menu': this.needs.add('getMenu'); this.needs.add('siteConfig'); return `await getMenu(siteConfig.menus.${arg})`
      case 'page':
        if (arg === 'base') return 'Astro.url.pathname'
        if (arg === 'current' || arg === 'total') return '1'
        return 'trail'
      case 'const': return /^(?:true|false|-?\d+(?:\.\d+)?)$/.test(arg) ? arg : `${sq(arg)} as const`
      default: throw new CodegenError(`${value} is not a plan value`)
    }
  }

  /** Prop name → expression for one element; variant axes and labels join the bound values. */
  props(values: Record<string, PlanValue>, scope: Scope | undefined, placement: PlanPlacement): Map<string, string> {
    const out = new Map<string, string>()
    for (const [name, value] of Object.entries(values)) out.set(name, this.value(value, scope))
    for (const [name, key] of Object.entries(placement.labels ?? {})) {
      this.needs.add('getStrings')
      out.set(name, `t(${sq(key)})`)
    }
    for (const [axis, option] of Object.entries(placement.variant ?? {})) out.set(axis, `${sq(option)} as const`)
    return out
  }

  /**
   * `const sectionN = <present> ? { props } : undefined`, then `{sectionN && <Name {...sectionN} />}`. A
   * required kit prop that content can leave empty is tested in the condition, which also narrows its type:
   * a section whose heading or items are missing renders nothing rather than an empty frame.
   */
  emit(section: string, name: string, kit: KitComponent | undefined, props: Map<string, string>, present: string[] = []): void {
    const tests = [...present]
    for (const [prop_, def] of Object.entries(kit?.props ?? {})) {
      let expr = props.get(prop_)
      if (!def.required || expr === undefined || /^(?:t\(|'|-?\d|true|false)/.test(expr)) continue
      if (!/^[\w$]+(?:\??\.[\w$]+)*$/.test(expr)) {
        const local = this.local('value')
        this.lines.push(`const ${local} = ${expr}`)
        props.set(prop_, local)
        expr = local
      }
      tests.push(def.type === 'array' ? `${expr}?.length` : `${expr} !== undefined`)
    }
    const object = `{\n${[...props].map(([key, expr]) => `  ${prop(key)}: ${expr},`).join('\n')}\n}`
    this.lines.push(tests.length ? `const ${section} = ${tests.join(' && ')} ? ${object} : undefined` : `const ${section} = ${object}`)
    this.body.push(tests.length ? `{${section} && <${name} {...${section}} />}` : `<${name} {...${section}} />`)
  }

  /** Is this a query of the route entry's list, a term archive's `$entry`? */
  where(where: Record<string, unknown> | undefined, item: string): string {
    if (!where) return ''
    const tests = Object.entries(where).map(([field, expected]) => {
      if (expected === '$entry') return `${item}.data.${field}.some(ref => ref.id === page.id)`
      if (field === 'wp_id' && Array.isArray(expected)) return `${JSON.stringify(expected)}.includes(${item}.data.wp_id ?? -1)`
      return `${item}.data.${field} === ${JSON.stringify(expected)}`
    })
    return tests.join(' && ')
  }

  placement(placement: PlanPlacement, index: number): void {
    const { name, importPath, kit } = componentOf(this.ctx, placement.component)
    this.imports.set(name, importPath)
    const bind: PlanBinding = placement.bind
    const section = `section${index}`
    const pageScope: Scope = { data: 'page.data', entry: 'page', model: 'pages' }

    if (bind.kind === 'collection') {
      const model = collectionName(bind.model)
      const item = 'item'
      let list: string
      if (bind.model === 'posts') { this.needs.add('getPosts'); list = 'await getPosts()' } else { this.needs.add('getCollection'); list = `await getCollection(${sq(model)})` }
      const test = this.where(bind.where, item)
      const sort = bind.sort && bind.model !== 'posts' ? bind.sort : undefined
      const sorted = sort
        ? `.toSorted((a, b) => ${sort.startsWith('-') ? `String(b.data.${sort.slice(1)}).localeCompare(String(a.data.${sort.slice(1)}))` : `String(a.data.${sort}).localeCompare(String(b.data.${sort}))`})`
        : ''
      const entries = this.local('entries')
      this.lines.push(`const ${entries} = (${list})${test ? `.filter(${item} => ${test})` : ''}${sorted}${bind.limit ? `.slice(0, ${bind.limit})` : ''}`)
      const scope: Scope = { data: `${item}.data`, entry: item, model: bind.model }
      // Item expressions run per entry; they collect their own awaits inside the async map.
      const outer = this.lines
      this.lines = []
      const itemProps = Object.entries(bind.item).map(([key, v]) => `      ${prop(key)}: ${this.value(v, scope)},`)
      const inner = this.lines
      this.lines = outer
      const items = this.local('items')
      this.lines.push(`const ${items} = await Promise.all(${entries}.map(async ${item} => {\n${inner.map(l => `  ${l}`).join('\n')}${inner.length ? '\n' : ''}  return {\n${itemProps.join('\n').replace(/^ {6}/gm, '    ')}\n  }\n}))`)
      const props = this.props(bind.props ?? {}, undefined, placement)
      if (bind.into) {
        props.set(bind.into, items)
        this.emit(section, name, kit, props)
      } else {
        const shared = this.local('shared')
        this.lines.push(`const ${shared} = {\n${[...props].map(([key, expr]) => `  ${prop(key)}: ${expr},`).join('\n')}\n}`)
        this.body.push(`{${items}.map(props => <${name} {...${shared}} {...props} />)}`)
      }
      return
    }

    if (bind.kind === 'model') {
      if (!bind.entry) throw new CodegenError(`${name}: a model binding without an entry id`)
      this.needs.add('getEntry')
      const entry = this.local('entry')
      // The loader keys an i18n collection's entries `<locale>/<id>`; a page reads the site's language.
      const i18n = this.ctx.models.get(bind.model)?.i18n === true
      this.lines.push(`const ${entry} = await getEntry(${sq(collectionName(bind.model))}, ${sq(i18n ? `${this.ctx.plan.site.locale}/${bind.entry}` : bind.entry)})`)
      const scope: Scope = { data: `${entry}.data`, entry, model: bind.model }
      // Values read the entry only when it exists; a missing section renders nothing.
      const outer = this.lines
      this.lines = []
      const props = this.props(bind.props, scope, placement)
      const inner = this.lines
      this.lines = outer
      if (inner.length) throw new CodegenError(`${name}: section values that need a lookup (media:, ref:, href:, term:) are not generated yet`)
      this.emit(section, name, kit, props, [entry])
      return
    }

    const props = this.props(bind.props ?? {}, bind.kind === 'entry' ? pageScope : undefined, placement)
    if (bind.kind === 'menu') {
      // A menu by slug, not by area.
      this.needs.add('getMenu')
      props.set(bind.into ?? 'items', `await getMenu(${sq(bind.menu)})`)
    }
    this.emit(section, name, kit, props)
  }

  source(name: string, showTitle: boolean): string {
    const astroContent = (['getEntry', 'getCollection'] as const).filter(n => this.needs.has(n))
    const lib = (['authorHref', 'byId', 'getMenu', 'getPosts', 'getSite', 'getStrings', 'imageOf', 'pageHref', 'postHref', 'termHref'] as const).filter(n => this.needs.has(n) || (n === 'byId' && this.needs.has('pages')))
    const imports = [
      ...(astroContent.length ? [`import { ${astroContent.join(', ')} } from 'astro:content'`] : []),
      ...[...this.imports].toSorted(([a], [b]) => a.localeCompare(b)).map(([n, p]) => `import ${n} from ${sq(p)}`),
      `import { ${[...lib, 'type Page'].join(', ')} } from '../../lib/content'`,
      ...(this.needs.has('siteConfig') ? [`import { siteConfig } from '../../site.config'`] : []),
      `import ComposedPage from '../ComposedPage.astro'`,
    ].toSorted((a, b) => importKey(a).localeCompare(importKey(b)))
    const shared = [...(this.needs.has('getSite') ? [['site', 'getSite()']] : []), ...(this.needs.has('getStrings') ? [['t', 'getStrings()']] : [])]
    const setup = [
      ...(shared.length === 1 ? [`const ${shared[0]![0]} = await ${shared[0]![1]}`] : []),
      ...(shared.length === 2 ? [`const [${shared.map(([n]) => n).join(', ')}] = await Promise.all([${shared.map(([, c]) => c).join(', ')}])`] : []),
      ...(this.needs.has('pages') ? [`const pages = await byId('pages')`] : []),
    ]
    return `---
// Generated by @contentrain/writer from the plan route \`${this.route.id}\`: the
// page's sections in order, each bound to the content it shows. Edit the
// content in Contentrain Studio; edit this file to change the page's layout.
${imports.join('\n')}

interface Props {
  page: Page
  trail: Array<{ title: string, href: string }>
  isHome: boolean
}

const { page, trail, isHome } = Astro.props
${[...setup, ...this.lines].join('\n')}
---
<ComposedPage page={page} trail={trail} isHome={isHome}${showTitle ? '' : ' showTitle={false}'}>
${this.body.map(line => `  ${line}`).join('\n')}
</ComposedPage>
`
  }
}

/** Is this route a list the starter's ListView renders (post cards, then pagination)? */
function starterList(ctx: Context, route: PlanRoute): boolean {
  const kits = route.sections.map(s => ctx.plan.components.find(c => c.id === s.component)?.kit?.id)
  const [cards, pager] = route.sections
  return route.sections.length > 0 && route.sections.length <= 2
    && kits[0] === 'post-card' && cards?.bind.kind === 'collection' && cards.bind.model === 'posts'
    && (route.sections.length === 1 || (kits[1] === 'pagination' && pager?.bind.kind === 'static'))
}

/** Which routes need a view, which the starter covers, which the generator cannot express. */
export function composedViews(plan: ProjectPlan, catalog: KitCatalog, models: readonly ModelDefinition[]): RoutePlanOutcome {
  const ctx: Context = { plan, catalog, models: new Map(models.map(m => [m.id, m])) }
  const out: RoutePlanOutcome = { views: [], covered: [], unsupported: [] }
  const names = new Set<string>()
  for (const route of plan.routes) {
    if (route.body === 'rich-text') {
      if (route.kind === 'custom') out.unsupported.push({ route: route.id, reason: 'a custom rich-text route has no starter view' })
      else out.covered.push(route.id)
      continue
    }
    if (starterList(ctx, route) && ['home', 'blog', 'category', 'tag', 'author'].includes(route.kind)) {
      out.covered.push(route.id)
      continue
    }
    const ids = route.source?.model === 'pages' ? route.source.where?.wp_id : undefined
    const wpIds = (Array.isArray(ids) ? ids : ids === undefined ? [] : [ids]).filter((id): id is number => typeof id === 'number')
    if (!wpIds.length) {
      out.unsupported.push({ route: route.id, reason: 'a composed route that is not a set of pages by wp_id' })
      continue
    }
    let name = pascal(route.id.startsWith('page-') ? route.id : `page-${route.id}`)
    while (names.has(name)) name = `${name}X`
    names.add(name)
    try {
      const view = new View(ctx, route)
      route.sections.forEach((s, i) => view.placement(s, i))
      const first = route.sections[0] && ctx.plan.components.find(c => c.id === route.sections[0]!.component)
      const showTitle = first?.kit?.id !== 'hero'
      out.views.push({ route: route.id, name, file: `src/views/composed/${name}.astro`, source: view.source(name, showTitle), wpIds })
    } catch (error) {
      if (!(error instanceof CodegenError)) throw error
      out.unsupported.push({ route: route.id, reason: error.message })
    }
  }
  return out
}

/** `src/views/composed/index.ts`: every composed view by the WordPress ids it renders. */
export function composedIndexSource(views: readonly ComposedView[]): string {
  const sorted = views.toSorted((a, b) => a.name.localeCompare(b.name))
  const entries = sorted.flatMap(v => v.wpIds.map(id => [id, v.name] as const)).toSorted(([a], [b]) => a - b)
  return `// Pages composed from sections, keyed by WordPress id. A migration writes one
// view per page it composed (hero, cards, text between them) and lists it
// here; every other page renders its body as rich text (PageView). A composed
// view takes PageView's props, so the route table treats both alike.
import type PageView from '../PageView.astro'
${sorted.map(v => `import ${v.name} from './${v.name}.astro'`).join('\n')}

export const composedViews: Partial<Record<number, typeof PageView>> = {${entries.length ? `\n${entries.map(([id, n]) => `  ${id}: ${n},`).join('\n')}\n` : ''}}
`
}
