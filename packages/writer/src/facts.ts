// The part of Migrate's fact pack (`facts@1`) the writer reads: templates,
// their renders at each width and their top-level regions. Declared here
// structurally, so the writer depends on the file format, not on Migrate's
// code.

export interface FactsRegion {
  /** Element-index path from <body>, e.g. `0.2`. */
  path: string
  tag: string
  /** `header`, `footer`, `nav`, a template-part slug, or null when unsettled. */
  name: string | null
  /** x, y, w, h in document px at 1280. */
  box: [number, number, number, number]
}

export interface FactsRender {
  width: number
  height: number
  /** PNG path relative to facts.json. */
  screenshot: string
}

export interface FactsTemplate {
  id: string
  kinds: string[]
  pages: string[]
  /** URL of the page rendered for the template. */
  representative: string
  representativeWpId?: number
  renders: Partial<Record<'390' | '768' | '1280', FactsRender>>
  regions: FactsRegion[]
}

export interface FactsView {
  format: string
  site: { origin: string, name: string, lang: string }
  templates: FactsTemplate[]
}

export const WIDTHS = [390, 768, 1280] as const
export type Width = (typeof WIDTHS)[number]

export function findTemplate(facts: FactsView, id: string): FactsTemplate {
  const template = facts.templates.find(t => t.id === id)
  if (!template) throw new Error(`facts have no template "${id}" (templates: ${facts.templates.map(t => t.id).join(', ')})`)
  return template
}

/** The site-relative address the migrated site builds a template's representative page at. */
export function representativePath(template: FactsTemplate): string {
  return new URL(template.representative).pathname
}
