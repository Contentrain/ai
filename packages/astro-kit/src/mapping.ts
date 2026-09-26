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
//   img:<selector>@src|@alt  one part of that image, for a list item's flat `image` + `imageAlt` fields
//   link:<selector>       a link as `{ label, href }`
//   html:<selector>       inner markup, kept as Markdown (rich text)
//   class:<cls>=<a>|<b>   <a> when the element, or an ancestor inside the matched element, has class
//                         <cls> (`*` matches any run of characters); <b> otherwise. An empty branch
//                         reads nothing and the prop keeps its default. `class:is-style-outline=ghost|primary`
//                         is WordPress's outline button as the kit's ghost action.
//
// Section rules (`sections`) classify a whole page section by the leaves it holds and fill the component's
// props from them: the same expressions, read from a named slot's leaf (`@title attr:title`).

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
  /**
   * Section rules: what a whole section of a page (an Elementor container, a Gutenberg group or columns,
   * a Divi section — facts `sections[]`) becomes, tried top to bottom before any element rule. The first
   * that matches wins; a section none matches falls through to the element `rules` inside it.
   */
  sections?: SectionRule[]
}

/**
 * A named group of a section's leaves: every leaf named `match` (and carrying `attr`) up to `max` of them.
 * `attr` values may list alternatives with `|` (`{ header_size: 'h1|h2' }`).
 */
export interface SectionSlot {
  match: string | string[]
  attr?: Record<string, string | number | boolean>
  /** At least this many leaves (default 0). */
  min?: number
  /** At most this many (default unbounded). */
  max?: number
}

/**
 * One section pattern. Values are the table's expressions, prefixed `@<slot> ` to read a slot's leaf
 * (`@title attr:title`); `a || b` takes the first non-empty (builder data first, rendered markup as fallback).
 * A slot of several leaves joins their text into a markdown prop; any other prop reads its first leaf.
 * A value without a slot reads the section's own root (a cover's background image, a container's setting).
 */
export interface SectionRule {
  /** Stable id (`hero.split`, `card-grid.icon-box`): plans record `<builder>:section:<id>`; JEW chooses among them. */
  id: string
  component: string
  variant?: Record<string, string>
  when?: {
    /** Where on the page: `first` is the page's first section, `last` its last. */
    position?: 'first' | 'last' | 'any'
    /** Column count(s) the section must have. */
    columns?: number | number[]
    /** Every leaf must fall into a slot (default true); false lets unclaimed leaves be. */
    only?: boolean
    /** `columns`: each column must match the slots on its own (a row of team members, price plans). */
    repeat?: 'columns'
    /** The section's root element(s): `core/cover`, `core/media-text` (a loose run of blocks is `run`). */
    root?: string | string[]
  }
  /**
   * Named leaf groups. Each leaf, in document order, goes to the first declared slot that matches it and
   * still has room, so declare a specific slot (an `attr` filter) before a general one on the same element.
   */
  slots: Record<string, SectionSlot>
  props?: Record<string, string>
  /**
   * Array prop filled once per `each`: a slot's leaves (`@card`), the parts a selector finds inside them
   * (`@list figure.wp-block-image`, `@faq .elementor-accordion-item`: a gallery's images, an accordion's
   * items), or the columns (`column`, with `repeat: 'columns'`).
   */
  into?: string
  each?: string
  /** One array item: relative to the leaf (`each: '@slot'`) or to the column, where `@<slot>` is that column's slot. */
  item?: Record<string, string>
}

/** A section leaf as the fact pack gives it: a builder element with its `blocks:` path. */
export interface SectionLeaf extends MappingNode {
  path: string
}

/** Where a section sits (facts `index`/`count`) and what it is (`root`: facts `root`). */
export interface SectionMeta {
  index: number
  count: number
  root?: string | undefined
}

/** Leaf paths per slot; with `repeat: 'columns'`, also per column. */
export interface SectionMatch {
  slots: Record<string, string[]>
  columns?: Record<string, string[]>[]
}

/** The id a plan records for a section rule. */
export function sectionRuleId(builder: KitBuilder, rule: Pick<SectionRule, 'id'>): string {
  return `${builder}:section:${rule.id}`
}

const SECTION_LAYOUT_LEAVES = new Set(['elementor/spacer', 'elementor/divider', 'core/spacer', 'core/separator', 'divi/et_pb_divider'])

function slotFits(slot: SectionSlot, leaf: SectionLeaf, defaults?: MappingTable['defaults']): boolean {
  if (![slot.match].flat().includes(leaf.name)) return false
  const attrs = attrsOf(leaf, defaults)
  return Object.entries(slot.attr ?? {}).every(([key, want]) => String(want).split('|').includes(String(attrs[key])))
}

/** Assign leaves to slots in document order, each to the first declared slot with room; null when the rule does not fit. */
function claimLeaves(rule: SectionRule, leaves: SectionLeaf[], defaults?: MappingTable['defaults']): Record<string, string[]> | null {
  const claimed: Record<string, string[]> = Object.fromEntries(Object.keys(rule.slots).map(name => [name, []]))
  for (const leaf of leaves) {
    if (SECTION_LAYOUT_LEAVES.has(leaf.name)) continue
    const slot = Object.entries(rule.slots).find(([name, def]) => claimed[name]!.length < (def.max ?? Infinity) && slotFits(def, leaf, defaults))
    if (slot) claimed[slot[0]]!.push(leaf.path)
    else if (rule.when?.only !== false) return null
  }
  for (const [name, def] of Object.entries(rule.slots)) if (claimed[name]!.length < (def.min ?? 0)) return null
  return claimed
}

/**
 * Whether a section rule fits a section, and which leaves fill which slot. `columns` are the section's
 * columns left to right, each its leaves in document order (layout containers already opened).
 */
export function matchSection(rule: SectionRule, columns: SectionLeaf[][], meta: SectionMeta, defaults?: MappingTable['defaults']): SectionMatch | null {
  const when = rule.when ?? {}
  if (when.root !== undefined && !(meta.root !== undefined && [when.root].flat().includes(meta.root))) return null
  if (when.position === 'first' && meta.index !== 0) return null
  if (when.position === 'last' && meta.index !== meta.count - 1) return null
  if (when.columns !== undefined && ![when.columns].flat().includes(columns.length)) return null
  if (when.repeat === 'columns') {
    if (columns.length < 2) return null
    const per = columns.map(leaves => claimLeaves(rule, leaves, defaults))
    if (per.some(c => !c)) return null
    const slots: Record<string, string[]> = Object.fromEntries(Object.keys(rule.slots).map(name => [name, per.flatMap(c => c![name]!)]))
    return { slots, columns: per as Record<string, string[]>[] }
  }
  const slots = claimLeaves(rule, columns.flat(), defaults)
  return slots && { slots }
}

/** The first section rule of a table that fits, with its match. */
export function classifySection(table: MappingTable, columns: SectionLeaf[][], meta: SectionMeta): { rule: SectionRule, match: SectionMatch } | null {
  for (const rule of table.sections ?? []) {
    const match = matchSection(rule, columns, meta, table.defaults)
    if (match) return { rule, match }
  }
  return null
}

/** A section value: alternatives joined by ` || `, each an optional `@<slot> ` then a mapping value. Returns the slots it reads, or null when malformed. */
export function sectionValueSlots(value: string): string[] | null {
  const slots: string[] = []
  for (const alternative of value.split(' || ')) {
    const m = /^(?:@([a-z][\w-]*) )?(.+)$/.exec(alternative)
    if (!m || !MAPPING_VALUE_PATTERN.test(m[2]!)) return null
    if (m[1]) slots.push(m[1])
  }
  return slots
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
  problems.push(...validateSections(table, components))
  return problems
}

function validateSections(table: MappingTable, components: Map<string, KitComponent>): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const rule of table.sections ?? []) {
    const at = `${table.builder} section ${rule.id}`
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/.test(rule.id)) problems.push(`${at}: id is not dotted kebab-case`)
    if (seen.has(rule.id)) problems.push(`${at}: listed twice`)
    seen.add(rule.id)
    const c = components.get(rule.component)
    if (!c) { problems.push(`${at}: component ${rule.component} is not in the catalog`); continue }
    for (const [axis, value] of Object.entries(rule.variant ?? {})) {
      if (!c.variants[axis]) problems.push(`${at}: ${c.id} has no variant axis ${axis}`)
      else if (!c.variants[axis]!.options.includes(value)) problems.push(`${at}: ${c.id}.${axis} has no option ${value}`)
    }
    if (!Object.keys(rule.slots).length) problems.push(`${at}: no slots`)
    for (const [name, slot] of Object.entries(rule.slots)) {
      if (!/^[a-z][\w-]*$/.test(name)) problems.push(`${at}: slot ${name} is not an identifier`)
      for (const element of [slot.match].flat()) if (!isBuilderElement(table.builder, element)) problems.push(`${at}: slot ${name} matches ${element}, not a ${table.builder} element`)
      if (slot.min !== undefined && slot.max !== undefined && slot.min > slot.max) problems.push(`${at}: slot ${name} min > max`)
    }
    for (const root of [rule.when?.root ?? []].flat()) if (root !== 'run' && !isBuilderElement(table.builder, root)) problems.push(`${at}: root ${root} is not a ${table.builder} element or run`)
    if (rule.when?.repeat === 'columns' && rule.each !== 'column') problems.push(`${at}: repeat columns needs each: column`)
    if (rule.each === 'column' && rule.when?.repeat !== 'columns') problems.push(`${at}: each column needs when.repeat columns`)
    const readsSlots = (value: string, where: string, type: string | undefined, slotted: boolean) => {
      const slots = sectionValueSlots(value)
      if (!slots) { problems.push(`${at}: ${where} = ${value} is not a section value`); return }
      if (!slotted && slots.length) problems.push(`${at}: ${where} reads a slot, but items of each ${rule.each} read their own leaf`)
      for (const slot of slots) {
        const def = rule.slots[slot]
        if (!def) problems.push(`${at}: ${where} reads undeclared slot ${slot}`)
        else if ((type === 'string' || type === 'text') && def.max !== 1) problems.push(`${at}: ${where} is ${type} but slot ${slot} may hold several leaves (max must be 1)`)
      }
    }
    for (const [prop, value] of Object.entries(rule.props ?? {})) {
      const def = c.props[prop]
      if (!def) problems.push(`${at}: ${c.id} has no prop ${prop}`)
      readsSlots(value, prop, def?.type, true)
    }
    if (rule.into) {
      const target = c.props[rule.into]
      if (!target || target.type !== 'array') problems.push(`${at}: ${c.id}.${rule.into} is not an array prop`)
      if (!rule.each) problems.push(`${at}: into ${rule.into} needs each`)
      else if (rule.each !== 'column' && !rule.slots[/^@([a-z][\w-]*)(?: \S.*)?$/.exec(rule.each)?.[1] ?? '']) problems.push(`${at}: each ${rule.each} is not @<declared slot> [selector] or column`)
      const fields = target && typeof target.items === 'object' ? target.items.fields ?? {} : {}
      for (const [field, value] of Object.entries(rule.item ?? {})) {
        if (!fields[field]) problems.push(`${at}: ${c.id}.${rule.into}[] has no field ${field}`)
        readsSlots(value, `${rule.into}[].${field}`, fields[field]?.type, rule.each === 'column')
      }
    } else if (rule.item || rule.each) problems.push(`${at}: each/item without into`)
    const bound = new Set([...Object.keys(rule.props ?? {}), ...(rule.into ? [rule.into] : [])])
    for (const [prop, def] of Object.entries(c.props)) if (def.required && !bound.has(prop)) problems.push(`${at}: required prop ${c.id}.${prop} has no source`)
  }
  return problems
}

/** Catalog sources of a builder that no rule of its table matches, as an element rule or a section slot. */
export function unmappedSources(table: MappingTable, catalog: KitCatalog): string[] {
  const matched = new Set([...table.rules.map(r => r.match), ...(table.sections ?? []).flatMap(r => Object.values(r.slots).flatMap(s => [s.match].flat()))])
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
