// The kit catalog: what each component is, what it takes, how it varies and
// which WordPress builder elements it stands in for. Machine-readable, so the
// migration writer chooses components by querying it instead of reading
// source, and the builder mapping tables (mapping/*.json) are checked against
// it.
//
// Props are described with Contentrain's own `FieldDef`, so a model field and
// the prop it feeds are compared type to type.

import type { FieldDef } from '@contentrain/types'

export const CATALOG_FORMAT = 'astro-kit-catalog@1'

/** The WordPress builders whose elements a component is fed from. */
export type KitBuilder = 'gutenberg' | 'elementor' | 'divi' | 'classic'
export const KIT_BUILDERS: readonly KitBuilder[] = ['gutenberg', 'elementor', 'divi', 'classic']

/** Element-name prefix per builder, as `facts.json` names elements (`core/cover`, `elementor/heading`, `divi/et_pb_blurb`). */
export const BUILDER_PREFIX: Record<KitBuilder, string> = {
  gutenberg: 'core/',
  elementor: 'elementor/',
  divi: 'divi/',
  classic: 'classic/',
}

/**
 * Whether an element name belongs to a builder. Gutenberg blocks are namespaced by their plugin
 * (`core/cover`, `yoast-seo/breadcrumbs`, `uagb/container`), so any `<ns>/<name>` that is not another
 * builder's is a Gutenberg block.
 */
export function isBuilderElement(builder: KitBuilder, name: string): boolean {
  if (builder !== 'gutenberg') return name.startsWith(BUILDER_PREFIX[builder])
  return /^[a-z0-9-]+\/[a-z0-9-]+(:[\w-]+)?$/.test(name) && !KIT_BUILDERS.some(b => b !== 'gutenberg' && name.startsWith(BUILDER_PREFIX[b]))
}

export type KitCategory = 'chrome' | 'section' | 'content' | 'primitive'

/** Client JavaScript a component ships: none, a few lines of dependency-free script (`vanilla`), Embla (carousel), Zag.js (accessible widget) or the Studio runtime. */
export type KitJs = 'none' | 'vanilla' | 'embla' | 'zag' | 'studio'

export type KitProp = FieldDef & { description: string }

export interface KitVariant {
  options: string[]
  default: string
  description: string
}

/** One component as written in `components/<id>/meta.json`. */
export interface KitComponentMeta {
  id: string
  name: string
  description: string
  category: KitCategory
  /** Kit components this one renders. */
  uses: string[]
  /** Files it imports from `components/_shared/`. */
  shared: string[]
  variants: Record<string, KitVariant>
  props: Record<string, KitProp>
  /** Named slots → what goes in them. `default` is the unnamed slot. */
  slots: Record<string, string>
  js: KitJs
  /** npm packages the site needs for this component, name → range. */
  dependencies: Record<string, string>
  /** Builder elements this component replaces, by builder — what the mapping tables map from. */
  sources: Partial<Record<KitBuilder, string[]>>
  /** How it meets its accessibility pattern. */
  a11y: string
}

/** A catalog entry: the meta plus the files that make the component. */
export interface KitComponent extends KitComponentMeta {
  /** Paths relative to `components/<id>/`. */
  files: string[]
}

export interface KitCatalog {
  format: typeof CATALOG_FORMAT
  /** Design tokens (Tailwind @theme names) the components read; the site must define them. */
  tokens: string[]
  /** npm packages every kit component needs. */
  dependencies: Record<string, string>
  components: KitComponent[]
}

/** Problems with a catalog, one line each; empty when it is sound. */
export function validateCatalog(catalog: KitCatalog): string[] {
  const problems: string[] = []
  const ids = new Set(catalog.components.map(c => c.id))
  for (const c of catalog.components) {
    const at = `component ${c.id}`
    if (!/^[a-z][a-z0-9-]*$/.test(c.id)) problems.push(`${at}: id must be kebab-case`)
    if (!c.files.length) problems.push(`${at}: no files`)
    for (const used of c.uses) if (!ids.has(used)) problems.push(`${at}: uses unknown component "${used}"`)
    for (const [axis, variant] of Object.entries(c.variants)) {
      if (!variant.options.includes(variant.default)) problems.push(`${at}: variant ${axis} default "${variant.default}" is not an option`)
    }
    for (const [name, prop] of Object.entries(c.props)) {
      if (!prop.description) problems.push(`${at}: prop ${name} has no description`)
      if (prop.type === 'select' && !prop.options?.length) problems.push(`${at}: select prop ${name} has no options`)
    }
    for (const [builder, names] of Object.entries(c.sources) as Array<[KitBuilder, string[]]>) {
      const prefix = BUILDER_PREFIX[builder]
      for (const name of names) if (!isBuilderElement(builder, name)) problems.push(`${at}: source "${name}" is not a ${builder} element (${prefix}…)`)
    }
  }
  const seen = new Set<string>()
  for (const c of catalog.components) {
    if (seen.has(c.id)) problems.push(`component ${c.id}: listed twice`)
    seen.add(c.id)
  }
  return problems
}

/** Components that replace a builder element, e.g. `core/cover` → hero. */
export function componentsForSource(catalog: KitCatalog, element: string): KitComponent[] {
  return catalog.components.filter(c => Object.values(c.sources).some(names => names?.includes(element)))
}
