---
"@contentrain/emitter-astro": minor
---

Per-page SEO: the emitter owns the head tags that describe a page

A migrated page inherited the template page's head verbatim, so every post
carried the template's `<link rel="canonical">`, its `og:title` and its Article
JSON-LD — and the emitter added nothing of its own. That is worse than having
none: a whole site canonicalised onto one URL de-indexes itself, and every
share card shows the same wrong story. SEO continuity is the reason a migration
keeps the source addresses at all.

`src/components/Seo.astro` now renders, per page, `<title>`, `description`,
`canonical`, Open Graph, Twitter card and — on entry pages — Article structured
data, from `EmitPost` / `QueryPage` / `RouteModel` and the configured site. The
canonical address comes from `Astro.url` and `site` rather than from data, so it
is by construction the address Astro generated. New optional fields:
`description`, `image`, `canonical`, `published_at`, `modified_at` on `EmitPost`;
`description`, `image`, `canonical` on `QueryPage`.

The template's copies of exactly those tags leave the head chrome, named in a
warning. Everything else the theme put in `<head>` stays, including JSON-LD that
is not page-scoped (`Organization`, `WebSite`, `BreadcrumbList`) and any JSON-LD
that cannot be parsed. Without `site.url` the canonical link and absolute social
URLs are omitted with a warning instead of pointing at a build host; a `featured`
entry that is a bare file name is not used as `og:image`, because only the
producer knows where media is served.

`options.seo: false` restores the previous behaviour exactly.

Verified on a generated project with a Yoast-style theme head:
`astro check && astro build` clean, and every page carries exactly one canonical
and one title, each its own.
