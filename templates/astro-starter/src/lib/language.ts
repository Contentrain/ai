// The site's language: one full BCP 47 tag (`pt-BR`, `zh-Hant`), written once and read everywhere.
// A stored `tr_TR` (WordPress's own spelling) is `tr-TR`; a site that names none uses the project's
// default locale (`.contentrain/config.json`), and one that has neither fails the build instead of
// printing English.

import config from '../../.contentrain/config.json'

/** The canonical BCP 47 form of a stored tag (`_` is `-`, `TR` is `tr`), or undefined when it is empty or not a tag. */
function normalizeLanguage(value: string | null | undefined): string | undefined {
  const raw = value?.trim().replace(/_/g, '-')
  if (!raw) return undefined
  try {
    return Intl.getCanonicalLocales(raw)[0]
  } catch {
    return undefined
  }
}

export function siteLanguage(stored: string | null | undefined): string {
  const language = normalizeLanguage(stored) ?? normalizeLanguage(config.locales.default)
  if (!language) throw new Error('The site has no language: set `language` in the site singleton or `locales.default` in .contentrain/config.json.')
  return language
}

/** How close a string's locale is to the site's: the same tag (3), the same language (2), English (1: what fills a gap), another (0). */
export function localeRank(locale: string | undefined, language: string): number {
  const tag = normalizeLanguage(locale)
  if (!tag) return 0
  if (tag === language) return 3
  if (tag.split('-')[0] === language.split('-')[0]) return 2
  return tag === 'en' ? 1 : 0
}
