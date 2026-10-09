// What a link preview shows (Open Graph, Twitter): the page's own words, not
// its document title. A source's SEO plugin prints `og:title` and
// `og:description` of their own ("Contact Us" beside the tab's "Contact Us –
// WP Tavern"); the migration keeps them as `seo.og_title` / `seo.og_description`.
// No imports, so the rule is tested on its own.

/**
 * `og:title` / `twitter:title`: the source's own when the content has one; else an SEO title written for the page
 * (`seo.title`, which Yoast and Rank Math fall back to for og:title); else the page's own title, without the site's
 * suffix the document title adds; else (the home, which has no title of its own) the document title.
 */
export function shareTitle(input: { own?: string | undefined, seoTitle?: string | undefined, title?: string | undefined, isHome: boolean, documentTitle: string }): string {
  if (input.own?.trim()) return input.own
  if (input.seoTitle?.trim()) return input.seoTitle
  if (!input.isHome && input.title?.trim()) return input.title
  return input.documentTitle
}

/**
 * `og:description` / `twitter:description`: the source's own when the content has one; else the page's meta
 * description (the source's, or the one composed for a page without).
 */
export function shareDescription(input: { own?: string | undefined, description?: string | undefined }): string | undefined {
  return input.own?.trim() ? input.own : input.description
}
