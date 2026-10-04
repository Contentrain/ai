---
"@contentrain/astro-kit": patch
---

Footer: below `md`, packed columns kept in a row no longer come out as wide as the brand block. The brand spans the whole row, and a spanning item's max-content grows the `auto` columns until they hold it (acf at 390: menus 75px and 80px wide for links 58px and 62px wide, the block 225px against the source's 190px). The row now ends with a flexible `1fr` track under the brand, so the brand keeps the full width and no longer grows the menus (nothing from `md` up changes).
