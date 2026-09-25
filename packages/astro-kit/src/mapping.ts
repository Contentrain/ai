// Builder mapping tables: which kit component a WordPress builder element
// becomes, and where each of its props comes from. One versioned table per
// builder (`mapping/<builder>.json`), written once and applied
// deterministically to every site — the migration model is asked only about
// elements no rule covers (Migrate's `unmapped_element` decision).
//
// A prop's source is one expression from a small closed set. The first six are
// the project plan's values (`@contentrain/types` `PlanValue`) and bind
// content; the rest read the builder element itself or the page it is on:
//
//   field:<name> · media:<field> · ref:<field>.<field> · href:self|<field> · term:<field> · ui:<key> · const:<value>
//   site:<field>          a field of the `site` singleton (`site:title`, `site:logo`)
//   menu:primary|footer   the menu the starter shows in that area
//   page:<value>          what the route knows: `page:base`, `page:current`, `page:total`, `page:breadcrumb`
//   attr:<name>           a builder attribute (block attribute, Elementor setting, Divi shortcode attribute)
//   dom:<selector>        text of the first match inside the element (empty selector: the element)
//   dom:<selector>@<attr> an attribute of it (`dom:a@href`)
//   img:<selector>        an image as the kit's `ImageInput` (src, alt, width, height)
//   link:<selector>       a link as `{ label, href }`
//   html:<selector>       inner markup, kept as Markdown (rich text)
//   class:<cls>=<a>|<b>   <a> when the element, or an ancestor inside the matched element, has class
//                         <cls> (`*` matches any run of characters); <b> otherwise. An empty branch
//                         reads nothing and the prop keeps its default. `class:is-style-outline=ghost|primary`
//                         is WordPress's outline button as the kit's ghost action.

import type { KitBuilder, KitCatalog, KitComponent } from './catalog.js'
import { isBuilderElement, KIT_BUILDERS } from './catalog.js'

export const MAPPING_FORMAT = 'astro-kit-mapping@1'

export const MAPPING_VALUE_PATTERN = /^(?:field:[\w-]+|media:[\w-]+|ref:[\w-]+\.[\w-]+|href:(?:self|[\w-]+)|term:[\w-]+|ui:[\w.-]+|const:(?:true|false|-?\d+(?:\.\d+)?|[a-z][a-z0-9_-]{0,31})|site:[\w-]+|menu:(?:primary|footer)|page:(?:base|current|total|breadcrumb)|attr:[\w.-]+|class:[\w*-]+=(?:[a-z][\w-]*)?\|(?:[a-z][\w-]*)?|(?:dom|img|link|html):[^@]*(?:@[\w-]+)?)$/

export interface MappingRule {
  /** Builder element, as the fact pack names it; a `:qualifier` narrows it (`core/template-part:header`). */
  match: string
  /** Extra conditions on the element. */
  when?: { attr?: Record<string, string | number | boolean>, class?: string }
  /** Kit component id. */
  component: string
  variant?: Record<string, string>
  /** Content the element lists rather than holds: one component per entry of the collection (`collection:posts`). */
  bind?: `collection:${string}`
  /** Consecutive sibling matches form one component (a row of Elementor icon boxes is one card grid). */
  group?: 'siblings'
  props?: Record<string, string>
  /** Array prop filled from repeated parts of the element (`each`) or the grouped siblings / bound entries. */
  into?: string
  /** Selector of the repeated parts inside the element, for `into`. */
  each?: string
  /** Props of one repeated part / sibling / entry, with sources relative to it. */
  item?: Record<string, string>
}

export interface MappingTable {
  format: typeof MAPPING_FORMAT
  builder: KitBuilder
  /** Bumped on any rule change: plans record the version they applied. */
  version: string
  /** What an element no rule covers becomes when no decision is made: rich text. */
  fallback: 'prose'
  /**
   * Attribute values the builder leaves out of its data while they are at their default, per element:
   * Elementor saves no `video_type` for a YouTube video. `when.attr` and `attr:` read through them.
   */
  defaults?: Record<string, Record<string, string | number | boolean>>
  rules: MappingRule[]
}

/** Problems with a mapping table against the catalog, one line each; empty when it is sound. */
export function validateMapping(table: MappingTable, catalog: KitCatalog): string[] {
  const problems: string[] = []
  if (table.format !== MAPPING_FORMAT) problems.push(`format is not ${MAPPING_FORMAT}`)
  if (!KIT_BUILDERS.includes(table.builder)) problems.push(`unknown builder ${table.builder}`)
  if (!/^\d+$/.test(table.version)) problems.push('version is not an integer string')
  for (const element of Object.keys(table.defaults ?? {})) if (!isBuilderElement(table.builder, element)) problems.push(`defaults ${element}: not a ${table.builder} element`)
  const components = new Map(catalog.components.map(c => [c.id, c]))
  const seen = new Set<string>()
  for (const rule of table.rules) {
    const at = `${table.builder} ${rule.match}${rule.when ? ' (when)' : ''}`
    const key = `${rule.match}|${JSON.stringify(rule.when ?? {})}`
    if (seen.has(key)) problems.push(`${at}: matched twice`)
    seen.add(key)
    if (!isBuilderElement(table.builder, rule.match)) problems.push(`${at}: not a ${table.builder} element`)
    const c = components.get(rule.component)
    if (!c) { problems.push(`${at}: component ${rule.component} is not in the catalog`); continue }
    for (const [axis, value] of Object.entries(rule.variant ?? {})) {
      // A variant is one option, or a `class:` choice between options read from the element.
      const choice = /^class:[\w*-]+=([a-z][\w-]*)?\|([a-z][\w-]*)?$/.exec(value)
      const options = choice ? [choice[1], choice[2]].filter((option): option is string => option !== undefined) : [value]
      if (!c.variants[axis]) problems.push(`${at}: ${c.id} has no variant axis ${axis}`)
      else for (const missing of options.filter(option => !c.variants[axis]!.options.includes(option))) problems.push(`${at}: ${c.id}.${axis} has no option ${missing}`)
    }
    for (const [prop, value] of Object.entries({ ...rule.props, ...(rule.into ? {} : rule.item) })) {
      if (!c.props[prop]) problems.push(`${at}: ${c.id} has no prop ${prop}`)
      if (!MAPPING_VALUE_PATTERN.test(value)) problems.push(`${at}: ${prop} = ${value} is not a mapping value`)
    }
    if (rule.into) {
      const target = c.props[rule.into]
      if (!target || target.type !== 'array') problems.push(`${at}: ${c.id}.${rule.into} is not an array prop`)
      const fields = target && typeof target.items === 'object' ? target.items.fields ?? {} : {}
      for (const [field, value] of Object.entries(rule.item ?? {})) {
        if (!fields[field]) problems.push(`${at}: ${c.id}.${rule.into}[] has no field ${field}`)
        if (!MAPPING_VALUE_PATTERN.test(value)) problems.push(`${at}: ${rule.into}[].${field} = ${value} is not a mapping value`)
      }
      if (!rule.each && !rule.group && !rule.bind) problems.push(`${at}: into ${rule.into} needs each, group or bind to say what repeats`)
    }
    if (rule.item && !rule.into && !rule.bind) problems.push(`${at}: item without into or bind`)
    const bound = new Set([...Object.keys(rule.props ?? {}), ...(rule.into ? [rule.into] : Object.keys(rule.item ?? {}))])
    for (const [prop, def] of Object.entries(c.props)) if (def.required && !bound.has(prop)) problems.push(`${at}: required prop ${c.id}.${prop} has no source`)
  }
  return problems
}

/** Catalog sources of a builder that no rule of its table matches. */
export function unmappedSources(table: MappingTable, catalog: KitCatalog): string[] {
  const matched = new Set(table.rules.map(r => r.match))
  const sources = catalog.components.flatMap((c: KitComponent) => c.sources[table.builder] ?? [])
  return [...new Set(sources)].filter(s => !matched.has(s)).toSorted()
}

/** Rules for an element, most specific (with `when` / qualifier) first. */
export function rulesFor(table: MappingTable, element: string): MappingRule[] {
  return table.rules
    .filter(r => r.match === element || r.match.split(':')[0] === element)
    .toSorted((a, b) => Number(!!b.when || b.match.includes(':')) - Number(!!a.when || a.match.includes(':')))
}

/** A builder element as the fact pack gives it (`FactBlock`): name, attributes, children. */
export interface MappingNode {
  name: string
  attrs?: Record<string, unknown>
  children?: MappingNode[]
}

/** An element's attributes with the builder's unsaved defaults filled in. */
export function attrsOf(node: MappingNode, defaults: MappingTable['defaults'] = {}): Record<string, unknown> {
  return { ...defaults[node.name], ...node.attrs }
}

/** Whether a rule's `match` (with an optional `:qualifier`) and `when.attr` fit an element. */
export function ruleMatches(rule: MappingRule, node: MappingNode, defaults?: MappingTable['defaults']): boolean {
  const [name, qualifier] = rule.match.split(':')
  if (name !== node.name) return false
  const attrs = attrsOf(node, defaults)
  // A qualifier names the element's role: a template part's area or slug, or a sub-part the fact pack marks.
  if (qualifier && ![attrs.area, attrs.slug, attrs.tagName, attrs.qualifier].includes(qualifier)) return false
  for (const [key, value] of Object.entries(rule.when?.attr ?? {})) if (attrs[key] !== value) return false
  if (rule.when?.class && !String(attrs.className ?? attrs.classes ?? '').split(/\s+/).includes(rule.when.class)) return false
  return true
}

/**
 * Apply a table to a tree: the outermost matching element owns its whole subtree, and nothing inside
 * it is matched again — a header template part holding the site title and logo is one header, not three.
 */
export function claimMatches(nodes: MappingNode[], table: MappingTable, path = '0'): { path: string, node: MappingNode, rule: MappingRule }[] {
  return nodes.flatMap((node, i) => {
    const at = `${path}.${i}`
    const rule = rulesFor(table, node.name).find(r => ruleMatches(r, node, table.defaults))
    return rule ? [{ path: at, node, rule }] : claimMatches(node.children ?? [], table, at)
  })
}
