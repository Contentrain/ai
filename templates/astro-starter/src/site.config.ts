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
  /**
   * The document title of a page with a title of its own: `{title}` and `{site}` are filled in.
   * A migration copies the source's pattern (Yoast's separator, WordPress's en dash); an entry's
   * SEO title replaces it whole.
   */
  titleTemplate: string
  /** Posts per index or archive page (WordPress: Settings → Reading). */
  postsPerPage: number
  /**
   * Menu slugs for the site's navigation areas; a missing menu renders nothing. The footer takes
   * its menus in order, one column each (the source theme's footer navigations).
   */
  menus: { primary: string, footer: readonly string[] }
  /**
   * A single post as the source's single template lays it out: the order of the header parts,
   * links to the previous and next post, and a list of other posts under it (0 for none).
   */
  post: {
    header: ReadonlyArray<'terms' | 'title' | 'byline' | 'cover'>
    adjacent: boolean
    more: number
  }
  /**
   * Post lists (the blog index and archives): cards, or every post in full as a WordPress query
   * loop that shows the post content does; `heading` shows the index's title on the front page too.
   * `text`: the size of each post's content in a full list, when the source's loop sets its own.
   */
  lists: { display: 'cards' | 'full', heading: boolean, text?: string }
  /**
   * The header and footer as the source's theme prints them; absent, the starter's own. `brand`:
   * the site title's size in the header. `tagline`: the header shows the tagline under the title.
   * `copyright`: the footer's line ("All rights reserved"; `{year}` is the current year), instead
   * of "© year Site".
   * `titleLinks`: post titles in lists take the link colour (`--color-link`), as the source's do;
   * `navLinks`: so does the header navigation.
   */
  chrome?: { brand?: string, tagline?: boolean, copyright?: string, titleLinks?: boolean, navLinks?: boolean }
  /**
   * The source site's hosts (`site.com`): a link to one of them in migrated content is internal
   * whatever its scheme, `www.` or letter case, and resolves through the published set. Fixed at
   * build time, so moving the site to a new domain in Studio does not turn the old links external.
   */
  sourceHosts: readonly string[]
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
  titleTemplate: '{title} – {site}',
  postsPerPage: 10,
  menus: { primary: 'primary', footer: ['footer'] },
  post: { header: ['terms', 'title', 'byline', 'cover'], adjacent: false, more: 0 },
  lists: { display: 'cards', heading: false },
  sourceHosts: [],
  ...(typeof __CONTENTRAIN_STUDIO__ !== 'undefined' && __CONTENTRAIN_STUDIO__ ? { studio: __CONTENTRAIN_STUDIO__ } : {}),
}
