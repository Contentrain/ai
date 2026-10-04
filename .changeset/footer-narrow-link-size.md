---
"@contentrain/astro-kit": minor
---

Footer: `linkSizeNarrow`, the links' font size below `md`. A source's footer links are often smaller on a phone than on a desktop (acf: 17.88px wide, ~16.4px at 390), and the one `linkSize` made the packed block wider there than the source's. The class overrides `linkSize` below `md`, stacked or in a row; absent, `linkSize` holds at every width as before. The starter reads it from `site.chrome.footerColumns.narrowSize`.
