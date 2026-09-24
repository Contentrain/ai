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
//   field:<name> · media:<field> · ref:<field>.<field> · href:self|<field> · ui:<key> · const:<value>
//   site:<field>          a field of the `site` singleton (`site:title`, `site:logo`)
//   menu:primary|footer   the menu the starter shows in that area
//   page:<value>          what the route knows: `page:base`, `page:current`, `page:total`, `page:breadcrumb`
//   attr:<name>           a builder attribute (block attribute, Elementor setting, Divi shortcode attribute)
//   dom:<selector>        text of the first match inside the element (empty selector: the element)
//   dom:<selector>@<attr> an attribute of it (`dom:a@href`)
//   img:<selector>        an image as the kit's `ImageInput` (src, alt, width, height)
//   link:<selector>       a link as `{ label, href }`
//   html:<selector>       inner markup, kept as Markdown (rich text)

import type { KitBuilder, KitCatalog, KitComponent } from './catalog.js'
import { isBuilderElement, KIT_BUILDERS } from './catalog.js'

export const MAPPING_FORMAT = 'astro-kit-mapping@1'

export const MAPPING_VALUE_PATTERN = /^(?:field:[\w-]+|media:[\w-]+|ref:[\w-]+\.[\w-]+|href:(?:self|[\w-]+)|ui:[\w.-]+|const:.*|site:[\w-]+|menu:(?:primary|footer)|page:(?:base|current|total|breadcrumb)|attr:[\w.-]+|(?:dom|img|link|html):[^@]*(?:@[\w-]+)?)$/

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
  rules: MappingRule[]
}

/** Problems with a mapping table against the catalog, one line each; empty when it is sound. */
export function validateMapping(table: MappingTable, catalog: KitCatalog): string[] {
  const problems: string[] = []
  if (table.format !== MAPPING_FORMAT) problems.push(`format is not ${MAPPING_FORMAT}`)
  if (!KIT_BUILDERS.includes(table.builder)) problems.push(`unknown builder ${table.builder}`)
  if (!/^\d+$/.test(table.version)) problems.push('version is not an integer string')
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
      if (!c.variants[axis]) problems.push(`${at}: ${c.id} has no variant axis ${axis}`)
      else if (!c.variants[axis]!.options.includes(value)) problems.push(`${at}: ${c.id}.${axis} has no option ${value}`)
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
