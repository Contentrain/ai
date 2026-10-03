---
"@contentrain/types": minor
"@contentrain/astro-kit": minor
---

**Footer: link columns packed at the end edge.** A theme's footer is often the brand on the left and its menus in a block on the right, each column as wide as its links. The plan's `site.chrome.footerColumns` (`gap` px between the columns, links `size` px, and `narrowGap` px when the columns stay side by side below 768) now carries it, and the Footer's new `pack` (`spread` | `end`), `narrow` (`stack` | `row`), `packGap`, `packGapNarrow` and `linkSize` honour it; the starter wires `site.config.ts` to them. Absent, nothing changes: the columns share the footer's width as before.
