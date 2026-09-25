// Site configuration that is not content: addresses, routing and service
// bindings. Editors change content in Contentrain Studio; this file changes
// with the code. A migration writes it once from the source site's settings
// (permalink structure, posts per page, front page) so every address the old
// site had is built at the same place.

export interface SiteConfig {
  /**
   * Address patterns, WordPress-style. Tokens: `:slug`, `:path` (a page with
   * its parents, `about/team`), `:year`, `:month`, `:day`, `:id`. Every pattern
   * starts and ends with a slash — the site is built with trailing slashes.
   */
  permalinks: {
    post: string
    page: string
    category: string
    tag: string
    author: string
    /** The posts index when the front page is a static page; otherwise the posts are listed at `/`. */
    blog: string
  }
  /** The front page: the posts index, or one page by slug. */
  home: { kind: 'posts' } | { kind: 'page', slug: string }
  /** Posts per index or archive page (WordPress: Settings → Reading). */
  postsPerPage: number
  /** Menu slugs for the site's navigation areas; a missing menu renders nothing. */
  menus: { primary: string, footer: string }
  /**
   * Contentrain Studio's public forms and comments API, from studio.json at the
   * project root (see astro.config.mjs). Without it, forms and comment threads
   * render nothing — a form that cannot be sent is worse than no form.
   */
  studio?: { baseUrl: string, projectId: string }
}

/** The Studio binding astro.config.mjs read from studio.json, or null. */
declare const __CONTENTRAIN_STUDIO__: { baseUrl: string, projectId: string } | null

export const siteConfig: SiteConfig = {
  permalinks: {
    post: '/blog/:slug/',
    page: '/:path/',
    category: '/category/:slug/',
    tag: '/tag/:slug/',
    author: '/author/:slug/',
    blog: '/blog/',
  },
  home: { kind: 'posts' },
  postsPerPage: 10,
  menus: { primary: 'primary', footer: 'footer' },
  ...(typeof __CONTENTRAIN_STUDIO__ !== 'undefined' && __CONTENTRAIN_STUDIO__ ? { studio: __CONTENTRAIN_STUDIO__ } : {}),
}
