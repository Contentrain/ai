// Site configuration that is not content: addresses, routing and service
// bindings. Editors change content in Contentrain Studio; this file changes
// with the code. A migration writes it once from the source site's settings
// (permalink structure, posts per page, front page) so every address the old
// site had is built at the same place.

/**
 * A field of a custom post type as its single page prints it: the label an editor sees (never a key), the
 * Contentrain field type, and for containers the fields of one row (`fields`) or the type of a scalar list (`of`).
 * A relation names the collection it points at.
 */
export interface CustomField {
  name: string
  label: string
  type: string
  collection?: string
  fields?: readonly CustomField[]
  of?: string
  /** How an array prints, as the source page did: an ordered list, or one disclosure per row (first value the summary). Absent: a plain list. */
  markup?: 'ol' | 'details'
  /** The source page printed the value without this field's name (a link row, a bare role): the starter prints the value alone. Absent: the label shows. */
  hideLabel?: boolean
}

/**
 * One piece of a post-meta row: the source's own words (in the site's language) or a part of the entry. A theme's
 * paragraph words always print; a part's own `prefix` / `suffix` (a post-terms block's "Tags: ") only with the part.
 */
type PostMetaToken = { text: string } | { part: 'date' | 'author' | 'terms' | 'tags', prefix?: string, suffix?: string }
/**
 * The block the source's single template prints after the content (Twenty Twenty-Five's post meta: "Published
 * <date> in <categories>", "by <author>", "Tags: …" in the theme's own words), as columns of rows of tokens.
 */
export type PostMeta = ReadonlyArray<ReadonlyArray<ReadonlyArray<PostMetaToken>>>

/**
 * A custom post type (WordPress: a registered post type with its own archive and taxonomies) as the route table builds it.
 * Everything is a field or collection name the migration found in the project's models; the page reads it through
 * Contentrain queries. `fields` is the typed list the single page prints in schema order, already without what has
 * no label to show.
 */
export interface CustomType {
  /** The content collection (`projectType`, not the model id `project-type`). */
  collection: string
  /**
   * The model id (`project-type`): the key the entry's comment thread is kept under in Studio, as `posts` is for a
   * post. A collection name cannot be turned back into it (`a_b` and `a-b` are both `aB`), so it is said here.
   * Absent: the type's pages show no thread.
   */
  model?: string
  /** Address of one entry: `/projects/:slug/`. */
  single: string
  /** `label`: the word the source's archive title prints before the name ("Archives: Projects"), where `lists.prefixed`. */
  archive?: { pattern: string, title: string, label?: string }
  /** Term lists: the entries whose `field` (a `relations` field) holds the term, at `pattern` (`/project-type/:slug/`). */
  taxonomies?: ReadonlyArray<{ collection: string, pattern: string, field: string, title: string }>
  /** What a card in a list shows; only `title` is required. */
  card: { title: string, excerpt?: string, image?: string, date?: string }
  /** The rich-text field holding the entry's body. */
  body?: string
  /** Previous / next links under the entry, newest first as WordPress orders them; only when the source's own page had them. */
  adjacent?: boolean
  /** The size the previous/next links print at (a CSS size), as the source's did; absent, the starter's own. */
  adjacentText?: string
  /** A list of this many other entries (newest first) under the entry, as the source's own page had; absent or 0: none. */
  more?: number
  /** The list also shows the entry being read, as the source's query did; absent, the entry is left out. */
  moreIncludesCurrent?: boolean
  /** The list holds the newest blog posts, as the source's single template showed, not other entries of this type. */
  moreOf?: 'posts'
  /** The size the list prints its titles at (a CSS size), as the source's did; absent, the starter's own. */
  moreText?: string
  /** The block the source's page prints after the content (`terms`: this type's first taxonomy); absent, none. */
  meta?: PostMeta
  /** The source page printed the fields above its body text (a role and links before a bio); absent, the body comes first. */
  fieldsFirst?: boolean
  fields: readonly CustomField[]
}

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
    /** The size the previous/next links print at (a CSS size), as the source's did; absent, the starter's own. */
    adjacentText?: string
    more: number
    /** The list also shows the post being read, as the source's query did; absent, the post is left out. */
    moreIncludesCurrent?: boolean
    /** The size the list prints its titles at (a CSS size), as the source's did; absent, the starter's own. */
    moreText?: string
    /** The block the source prints after the content; absent, the tags row. */
    meta?: PostMeta
  }
  /**
   * Post lists (the blog index and archives): cards in a grid, cards in one column (`list`, as themes
   * whose archive is a single stack of posts show it), or every post in full as a WordPress query
   * loop that shows the post content does; `heading` shows the index's title on the front page too.
   * `text`: the size of each post's content in a full list, when the source's loop sets its own.
   * `tone`: `muted` when the source's loop sets the muted text colour on the list itself; titles keep their own colour.
   * `surface`: a card is a surface of its own (`--color-card`, `--shadow-card`, `--spacing-card`) on a page that may be
   * tinted (`--color-page`). `byline`: the category above the title, `author / date` under it. `columns`: the cards'
   * column count from 600px up, as the source's grid prints it; absent, two then three.
   */
  lists: { display: 'cards' | 'list' | 'full', heading: boolean, text?: string, tone?: 'muted', surface?: boolean, byline?: boolean, prefixed?: boolean, columns?: number }
  /**
   * The footer as the source prints it (a migration reads each off the rendered footer); a key absent keeps the
   * starter's own. `feed`: the "RSS feed" link in the last column (`/rss.xml` itself is always served). `border`: a
   * border on the footer's top side. `copyright`: the line, or `false` for none; the "Powered by WordPress" credit is
   * platform chrome and is never printed.
   */
  footer?: { feed?: boolean, border?: boolean, copyright?: string | false }
  /**
   * The header and footer as the source's theme prints them; absent, the starter's own. `brand`:
   * the site title's size in the header. `tagline`: the header shows the tagline under the title.
   * `copyright`: the footer's line ("All rights reserved"; `{year}` is the current year), instead
   * of "© year Site".
   * `titleLinks`: post titles in lists take the link colour (`--color-link`), as the source's do;
   * `navLinks`: so does the header navigation. `footerAlign`: `center` when the source's footer is
   * one centred column; absent, brand and links to the sides. `footerColumns`: the link columns packed at the end edge, `gap` px apart, links `size` px (`narrowSize` px below 768), side by side below 768 at `narrowGap` px (absent: stacked); absent, they share the footer's width.
   * `header`: what the source's header does differently (no line under the bar, the site name's weight and letter-spacing, the space above and inside the bar); a key absent: the starter's own.
   */
  chrome?: { brand?: string, tagline?: boolean, copyright?: string, titleLinks?: boolean, navLinks?: boolean, footerAlign?: 'start' | 'center', footerColumns?: { gap: number, size?: number, narrowGap?: number, narrowSize?: number }, header?: { border?: false, brandWeight?: string, brandTracking?: string, offsetTop?: string, padTop?: string, padBottom?: string } }
  /**
   * The site singleton's fields that hold the contact details, by field name (a migration finds them
   * in the source's settings: an ACF options page). The footer prints what is set: `address`,
   * `phone` and `email` as text, `socials` as a list of rows each with a link and a label.
   * Absent, or a field empty, the footer prints nothing for it.
   */
  contact?: { address?: string, phone?: string, email?: string, socials?: string }
  /** Custom post types: each gets its single pages, archive and term lists. */
  types?: readonly CustomType[]
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
  /**
   * Where forms and comment threads live when they are not Studio's — the owner's choice at
   * migration. Absent, both wait for Studio as above. `wordpress`: the WordPress site that stays up
   * for what was kept on it (`https://…`, no path); a part kept there links to the same page on it.
   * A form posts to a form service (`endpoint`: its https action), or the page shows an address to
   * write to (`mailto`), or a link to the form on WordPress. Comments stay on WordPress or go to Studio.
   * Until Studio is bound, a Studio form links to the form on `wordpress` when it is set, else shows `email` (the
   * address the source site published) to write to — never an empty place on the page.
   */
  features?: {
    wordpress?: string
    email?: string
    forms?: { home: 'studio' } | { home: 'endpoint', action: string } | { home: 'mailto', address: string } | { home: 'wordpress' }
    comments?: { home: 'studio' } | { home: 'wordpress' }
  }
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
