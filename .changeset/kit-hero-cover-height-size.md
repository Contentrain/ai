---
'@contentrain/astro-kit': minor
---

Hero takes the source's own cover height and heading size. `minHeight` (a cover's height as the source sets it, `520px`, `60vh`) and `headingSize` (`58px`, `clamp(2.15rem, 4vw, 3.6rem)`, with a 1.2 line height) are non-content props: a migration reads them from the source's computed styles, so a cover is as tall and its heading as large as the original's. Only a plain CSS size reaches the style attribute; anything else is ignored. Unset, the layout's own heights and type scale are unchanged.
