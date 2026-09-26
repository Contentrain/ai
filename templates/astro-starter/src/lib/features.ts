// Where a form or a comment thread goes on this site (site.config.ts `features`):
// the one place components ask, so a section never shows an empty form column.
import { siteConfig } from '../site.config'

export type FormHome = 'studio' | 'endpoint' | 'mailto' | 'wordpress'

/** The address of this page on the WordPress site that kept a feature, or undefined. */
export function onWordPress(pathname: string): string | undefined {
  const base = siteConfig.features?.wordpress
  return base ? new URL(pathname, base).href : undefined
}

/** How a form renders here, or null when nothing can (Studio not bound yet, WordPress address unknown). */
export function formHome(): FormHome | null {
  const forms = siteConfig.features?.forms ?? { home: 'studio' as const }
  if (forms.home === 'studio') return siteConfig.studio ? 'studio' : null
  if (forms.home === 'wordpress') return siteConfig.features?.wordpress ? 'wordpress' : null
  return forms.home
}

/** How a comment thread renders here: Studio's (ready or pending), or a link to it on WordPress. */
export function commentsHome(): 'studio' | 'wordpress' {
  return siteConfig.features?.comments?.home === 'wordpress' && siteConfig.features.wordpress ? 'wordpress' : 'studio'
}
