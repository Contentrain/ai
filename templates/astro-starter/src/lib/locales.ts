// The site's languages: which locales it builds, where each one lives and which language tag it prints. A site in one
// language (no `siteConfig.locales`) has one locale, the project's default, at the root: every address and every
// entry is that locale's, and nothing here changes what it builds. A site in several reads the codes from
// `.contentrain/config.json` (`locales.default`, `locales.supported`) and, from site.config.ts, the address prefix
// (`''` for the root, else one path segment: `de`, `pt-br`) and the BCP 47 tag (`pt-BR`) of each. A translated
// entry is the same entry id in another locale's content file; the loader marks each entry of an i18n model with its
// `locale`.

import config from '../../.contentrain/config.json'
import { siteConfig } from '../site.config'
import { withBase, withoutBase } from './base'

interface SiteLocale {
  /** The content code (`de`, `pt-BR`): the name of its content files. */
  code: string
  /** The address segment its pages live under (`de`, `pt-br`), or `''` at the root. */
  prefix: string
  /** The language tag its pages print (`pt-BR`); absent on a one-language site, whose site singleton says it. */
  tag?: string | undefined
}

const SEGMENT = /^[^/?#\s.][^/?#\s]*$/

function readLocales(): SiteLocale[] {
  const { default: fallback } = config.locales
  const declared = siteConfig.locales
  if (!declared) return [{ code: fallback, prefix: '' }]
  const supported: readonly string[] = (config.locales as { supported?: readonly string[] }).supported ?? [fallback]
  const problems: string[] = []
  if (!supported.includes(fallback)) problems.push(`the default locale ${fallback} is not in locales.supported`)
  for (const code of Object.keys(declared.prefixes)) if (!supported.includes(code)) problems.push(`prefixes names ${code}, which locales.supported does not`)
  for (const code of Object.keys(declared.tags)) if (!supported.includes(code)) problems.push(`tags names ${code}, which locales.supported does not`)
  const locales = supported.map((code) => {
    const prefix = declared.prefixes[code]
    const tag = declared.tags[code]
    if (prefix === undefined) problems.push(`${code} has no prefix`)
    else if (prefix !== '' && !SEGMENT.test(prefix)) problems.push(`${code}'s prefix "${prefix}" is not one path segment`)
    if (!tag) problems.push(`${code} has no language tag`)
    return { code, prefix: prefix ?? '', tag }
  })
  // The root is the default's or no one's: another language there would share its feed and its home with no language.
  for (const locale of locales) if (locale.prefix === '' && locale.code !== fallback) problems.push(`${locale.code} is at the root, which only the default locale ${fallback} may be`)
  const prefixes = locales.map(locale => locale.prefix)
  if (new Set(prefixes).size !== prefixes.length) problems.push(`two locales share a prefix (${prefixes.map(prefix => prefix || "''").join(', ')})`)
  if (problems.length) throw new Error(`site.config.ts locales and .contentrain/config.json disagree: ${problems.join('; ')}.`)
  // The default first: it is the one a page outside every prefix belongs to, and the one x-default names.
  return locales.toSorted((a, b) => Number(b.code === fallback) - Number(a.code === fallback))
}

/** Every locale the site builds, the default first. */
export const siteLocales: readonly SiteLocale[] = readLocales()

/** The default locale's code. */
export const defaultLocale = siteLocales[0]!.code

/** Whether the site is built in more than one locale. */
export const multilingual = siteLocales.length > 1

const byCode = new Map(siteLocales.map(locale => [locale.code, locale]))

/** The locale an entry belongs to: its own (an i18n model's entry), else the default (a model that is not translated). */
export const entryLocale = (entry: { data: object }): string => {
  const own = (entry.data as { locale?: unknown }).locale
  return typeof own === 'string' && byCode.has(own) ? own : defaultLocale
}

/** The entries of one locale. On a one-language site every entry is the site's: nothing is left out. */
export function inLocale<T extends { data: object }>(entries: readonly T[], locale: string): T[] {
  return multilingual ? entries.filter(entry => entryLocale(entry) === locale) : [...entries]
}

/**
 * The entries a locale shows of a model that may not be translated (menus, authors): its own, and those of no locale,
 * which every locale shows. On a one-language site every entry.
 */
export function sharedIn<T extends { data: object }>(entries: readonly T[], locale: string): T[] {
  if (!multilingual) return [...entries]
  return entries.filter((entry) => {
    const own = (entry.data as { locale?: unknown }).locale
    return typeof own !== 'string' || own === locale
  })
}

/** The posts feed of a locale: the default's at `/rss.xml` wherever its pages live, another's under its prefix. */
export const feedPath = (locale: string): string => (locale === defaultLocale ? withBase('/rss.xml') : localizedPath(withBase('/rss.xml'), locale))

/** A served address (`/about/`, `/blog/about/` under a `base`) in a locale: under its prefix (`/de/about/`), the root's unchanged. */
export function localizedPath(path: string, locale: string): string {
  const prefix = byCode.get(locale)?.prefix
  if (!prefix || !path.startsWith('/') || path.startsWith('//')) return path
  return withBase(`/${prefix}${withoutBase(path)}`)
}

/** The locale a served address belongs to: the one whose prefix is its first segment, else the root's, else the default. */
export function localeOf(path: string): string {
  const first = withoutBase(path).split('/')[1] ?? ''
  const prefixed = first ? siteLocales.find(locale => locale.prefix === first) : undefined
  return (prefixed ?? siteLocales.find(locale => locale.prefix === '') ?? siteLocales[0]!).code
}

/** The language tag site.config.ts gives a locale; absent on a one-language site. */
export const localeTag = (locale: string): string | undefined => byCode.get(locale)?.tag

/** Where the root sends a visitor when the default locale has a prefix (`/` → `/en/`); undefined when the default is at the root. */
export function rootRedirect(): { from: string, to: string } | undefined {
  const home = withBase('/')
  const to = localizedPath(home, defaultLocale)
  return to === home ? undefined : { from: home, to }
}

/** The name a language calls itself (`Deutsch`, `Türkçe`), for a link to it; the tag itself when the runtime has no name. */
export function languageName(tag: string): string {
  let name: string | undefined
  try { name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) } catch { name = undefined }
  return name ? name.charAt(0).toLocaleUpperCase(tag) + name.slice(1) : tag
}
