import type { ModelDefinition } from '@contentrain/types'
import { contentDirPath, contentFilePath, documentFilePath } from '../paths.js'
import type { CachedReader } from './read.js'

export const SIDES = ['base', 'ours', 'theirs'] as const
export type TreeSide = (typeof SIDES)[number]

export interface Readers {
  base: CachedReader
  ours: CachedReader
  theirs: CachedReader
}

/** Union of model ids across the three trees, sorted. */
export async function listModelIds(readers: Readers): Promise<string[]> {
  const listings = await Promise.all(SIDES.map(side => readers[side].listDirectory('.contentrain/models')))
  const ids = new Set<string>()
  for (const listing of listings) {
    for (const entry of listing) {
      if (entry.endsWith('.json')) ids.add(entry.slice(0, -'.json'.length))
    }
  }
  return [...ids].toSorted()
}

/** One physical content file of a model, as found on ONE side. */
export interface SideUnit {
  locale?: string
  slug?: string
  path: string
}

/**
 * Enumerate a model's content files on one side, using THAT side's model
 * definition — `content_path` and `locale_strategy` may differ between
 * sides, so each side's files are found where that side actually keeps
 * them. Filenames are mapped back to (locale, slug) by inverting the
 * `paths.ts` layout for the declared strategy; nothing is guessed from
 * config.
 */
export async function enumerateSideUnits(
  reader: CachedReader,
  def: ModelDefinition,
  defaultLocale: string,
): Promise<SideUnit[]> {
  const dir = contentDirPath(def)
  const strategy = def.locale_strategy ?? 'file'
  const units: SideUnit[] = []

  if (def.kind === 'document') {
    if (!def.i18n || strategy === 'none') {
      const entries = await reader.listDirectory(dir)
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          units.push({ locale: defaultLocale, slug: entry.slice(0, -3), path: `${dir}/${entry}` })
        }
      }
      return units
    }
    if (strategy === 'suffix') {
      const entries = await reader.listDirectory(dir)
      for (const entry of entries) {
        const match = /^(.+)\.([a-z]{2}(?:-[A-Za-z]{2})?)\.md$/.exec(entry)
        if (match) units.push({ slug: match[1]!, locale: match[2]!, path: `${dir}/${entry}` })
      }
      return units
    }
    if (strategy === 'directory') {
      const locales = await reader.listDirectory(dir)
      const listings = await Promise.all(locales.map(async locale =>
        ({ locale, entries: locale.includes('.') ? [] : await reader.listDirectory(`${dir}/${locale}`) })))
      for (const { locale, entries } of listings) {
        for (const entry of entries) {
          if (entry.endsWith('.md')) units.push({ locale, slug: entry.slice(0, -3), path: `${dir}/${locale}/${entry}` })
        }
      }
      return units
    }
    // default 'file': {dir}/{slug}/{locale}.md
    const slugs = await reader.listDirectory(dir)
    const listings = await Promise.all(slugs.map(async slug =>
      ({ slug, entries: slug.includes('.') ? [] : await reader.listDirectory(`${dir}/${slug}`) })))
    for (const { slug, entries } of listings) {
      for (const entry of entries) {
        if (entry.endsWith('.md')) units.push({ slug, locale: entry.slice(0, -3), path: `${dir}/${slug}/${entry}` })
      }
    }
    return units
  }

  // JSON kinds: collection / singleton / dictionary.
  if (!def.i18n) {
    if (await reader.fileExists(`${dir}/data.json`)) {
      units.push({ locale: defaultLocale, path: `${dir}/data.json` })
    }
    return units
  }
  if (strategy === 'none') {
    if (await reader.fileExists(`${dir}/${def.id}.json`)) {
      units.push({ locale: defaultLocale, path: `${dir}/${def.id}.json` })
    }
    return units
  }
  if (strategy === 'suffix') {
    const entries = await reader.listDirectory(dir)
    const prefix = `${def.id}.`
    for (const entry of entries) {
      if (entry.startsWith(prefix) && entry.endsWith('.json')) {
        const locale = entry.slice(prefix.length, -'.json'.length)
        if (locale && !locale.includes('.')) units.push({ locale, path: `${dir}/${entry}` })
      }
    }
    return units
  }
  if (strategy === 'directory') {
    const locales = await reader.listDirectory(dir)
    const checks = await Promise.all(locales.map(async locale => ({
      locale,
      exists: locale.includes('.') ? false : await reader.fileExists(`${dir}/${locale}/${def.id}.json`),
    })))
    for (const { locale, exists } of checks) {
      if (exists) units.push({ locale, path: `${dir}/${locale}/${def.id}.json` })
    }
    return units
  }
  // default 'file': {dir}/{locale}.json
  const entries = await reader.listDirectory(dir)
  for (const entry of entries) {
    if (entry.endsWith('.json') && entry !== 'data.json') {
      units.push({ locale: entry.slice(0, -'.json'.length), path: `${dir}/${entry}` })
    }
  }
  return units
}

/** Resolve the output path of a logical unit under the WINNING definition. */
export function unitOutPath(winning: ModelDefinition, defaultLocale: string, locale?: string, slug?: string): string {
  if (winning.kind === 'document') {
    return documentFilePath(winning, locale ?? defaultLocale, slug ?? '')
  }
  return contentFilePath(winning, locale ?? defaultLocale)
}

/** One meta file of a model on one side. Meta layout never moves between sides. */
export interface MetaUnit {
  locale: string
  slug?: string
  path: string
}

/**
 * Enumerate a model's meta files on one side. The meta layout is fixed
 * (`.contentrain/meta/{id}/[{slug}/]{locale}.json`) regardless of
 * `content_path` or locale strategy, so this stays definition-light and
 * works even while the definitions disagree.
 */
export async function enumerateMetaUnits(reader: CachedReader, modelId: string): Promise<MetaUnit[]> {
  const dir = `.contentrain/meta/${modelId}`
  const entries = await reader.listDirectory(dir)
  const units: MetaUnit[] = []
  const slugDirs: string[] = []
  for (const entry of entries) {
    if (entry.endsWith('.json')) {
      units.push({ locale: entry.slice(0, -'.json'.length), path: `${dir}/${entry}` })
    } else if (!entry.includes('.')) {
      slugDirs.push(entry)
    }
  }
  const nested = await Promise.all(slugDirs.map(async slug =>
    ({ slug, entries: await reader.listDirectory(`${dir}/${slug}`) })))
  for (const { slug, entries: files } of nested) {
    for (const file of files) {
      if (file.endsWith('.json')) {
        units.push({ locale: file.slice(0, -'.json'.length), slug, path: `${dir}/${slug}/${file}` })
      }
    }
  }
  return units
}

const SCAN_MAX_DEPTH = 6
const SCAN_SKIP = new Set(['.contentrain/client', '.contentrain/context.json'])

/**
 * Recursively list candidate text files (`.json` / `.md`) under `root` on
 * one side. The generated client and context.json are never candidates;
 * depth is bounded as a runaway guard. Anything that is not a candidate
 * extension is treated as a possible directory — listing a file yields an
 * empty array on every reader, so the probe is safe.
 */
export async function listTextFiles(reader: CachedReader, root: string, depth = 0): Promise<string[]> {
  if (depth > SCAN_MAX_DEPTH) return []
  const entries = await reader.listDirectory(root)
  const results = await Promise.all(entries.map(async (entry) => {
    const path = root === '' ? entry : `${root}/${entry}`
    if (SCAN_SKIP.has(path)) return []
    if (entry.endsWith('.json') || entry.endsWith('.md')) return [path]
    return listTextFiles(reader, path, depth + 1)
  }))
  return results.flat()
}
