---
"@contentrain/types": minor
---

`RawIR` gains three optional parts that a WordPress bridge produces.

- `seo` (`RawSeo`, `RawSeoEntry`, `RawSeoSettings`, `SEO_PROVIDERS`): which plugin serves the head, each provider's status and settings, and each page's values. `status: 'none'` means the site has no SEO plugin, not a missing export. `resolved` separates rendered values from stored templates, and `robots_served` is what the page actually carries.
- `routing` (`RawRouting`): the permalink structure, bases, front and posts pages, and every post type's and taxonomy's permastruct.
- `redirects_excluded` (`RawRedirectExcluded`): every rule a source holds that the site does not serve as a plain redirect, with the reason.

`RawRedirect` gains optional `id`, `match`, `regex`, `served_by` and `status_note`. Only `match: 'url'` without `regex` is a plain mapping. The shapes are checked against the Bridge's own output, which is committed as fixtures.
