---
'@contentrain/astro-kit': minor
'@contentrain/types': minor
---

Footer marks its text `data-kit-footer`, so a site's theme can size it with `--text-footer` (a new plan token role); the kit's own size stays `text-sm`. Nav takes `color: 'link'`, the site's link colour at full strength, and Header's `linkNav` uses it: the narrow-screen toggle keeps the header's text colour. Header renders the site title once, with or without a tagline.
