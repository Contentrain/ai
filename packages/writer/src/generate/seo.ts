// The source site's SEO, carried over as data. WordPress (or Yoast, Rank
// Math) printed a document title and a description per page; the migrated
// site prints the same. Titles that follow the site's pattern stay a pattern
// (`siteConfig.titleTemplate`), so an editor who renames a page in Studio
// renames its title too; titles written by hand, and every description,
// become the entry's `seo` fields, editable in Studio.
//
// This is a deterministic copy from the fact pack, like the rest of the
// import: no model decides a title.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canonicalStringify, type ModelDefinition } from '@contentrain/types'

export interface FactsSeo {
  site: { name: string }
  seo?: { provider?: string, entries: Record<string, { title?: string, description?: string, robots?: string }> }
  content?: { entries: Array<{ wpId: number, type: string, title: string }> }
}

const SEPARATORS = [' - ', ' – ', ' — ', ' | ', ' · ', ' • ', ' » ', ' :: ', ' / ']

/** The source's title pattern: the separator most pages put between their title and the site name. */
export function titleTemplateOf(facts: FactsSeo, fallback = '{title} – {site}'): string {
  const counts = new Map<string, number>()
  for (const entry of facts.content?.entries ?? []) {
    const title = facts.seo?.entries[String(entry.wpId)]?.title
    if (!title || !entry.title) continue
    for (const sep of SEPARATORS) {
      if (title === `${entry.title}${sep}${facts.site.name}`) counts.set(sep, (counts.get(sep) ?? 0) + 1)
    }
  }
  const best = [...counts].toSorted((a, b) => b[1] - a[1])[0]
  return best ? `{title}${best[0]}{site}` : fallback
}

const fill = (template: string, title: string, site: string) => template.replace('{title}', title).replace('{site}', site)

interface SeoField { title?: string, description?: string, noindex?: boolean, [key: string]: unknown }

/**
 * Updated content files for posts and pages: `seo.title` where the source's title is not the pattern's,
 * `seo.description` where the source had one, `seo.noindex` where it asked for it. Returns path → text
 * for the files that change; entries without source SEO are left as they are.
 */
export async function seoContentFiles(projectDir: string, models: readonly ModelDefinition[], facts: FactsSeo, template: string): Promise<{ files: Record<string, string>, entries: number }> {
  const files: Record<string, string> = {}
  let changed = 0
  const bySource = facts.seo?.entries ?? {}
  for (const id of ['posts', 'pages']) {
    const model = models.find(m => m.id === id)
    if (!model?.fields?.seo || model.i18n) continue
    const path = `.contentrain/content/${model.domain}/${id}/data.json`
    let data: Record<string, Record<string, unknown>>
    try { data = JSON.parse(await readFile(join(projectDir, path), 'utf8')) as typeof data }
    catch { continue }
    let touched = false
    for (const entry of Object.values(data)) {
      const source = bySource[String(entry.wp_id)]
      if (!source) continue
      const seo: SeoField = { ...(entry.seo as SeoField | undefined) }
      const title = typeof entry.title === 'string' ? entry.title : ''
      if (source.title && source.title !== fill(template, title, facts.site.name)) seo.title = source.title
      if (source.description) seo.description = source.description
      if (source.robots && /\bnoindex\b/i.test(source.robots)) seo.noindex = true
      if (Object.keys(seo).length === 0 || JSON.stringify(seo) === JSON.stringify(entry.seo)) continue
      entry.seo = seo
      touched = true
      changed++
    }
    if (touched) files[path] = canonicalStringify(data)
  }
  return { files, entries: changed }
}

/** What an importer writes when it could not read the site's name (wp-import before the REST index was read). */
const PLACEHOLDER_TITLES = new Set(['', 'Site'])

/**
 * The site singleton with the source's name, when the store has none of its own: every document title
 * (`{title} - {site}`), the feed and the JSON-LD organization print it. A name an editor or the importer
 * set is kept. Returns the file's path and text, or undefined when nothing changes.
 */
export async function siteTitleFile(projectDir: string, facts: FactsSeo): Promise<{ path: string, text: string } | undefined> {
  const name = facts.site.name.trim()
  const path = '.contentrain/content/site/site/data.json'
  let site: Record<string, unknown>
  try { site = JSON.parse(await readFile(join(projectDir, path), 'utf8')) as typeof site }
  catch { return undefined }
  const current = typeof site.title === 'string' ? site.title.trim() : ''
  if (!name || PLACEHOLDER_TITLES.has(name) || !PLACEHOLDER_TITLES.has(current)) return undefined
  return { path, text: canonicalStringify({ ...site, title: name }) }
}
