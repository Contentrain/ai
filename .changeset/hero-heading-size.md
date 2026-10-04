---
"@contentrain/astro-kit": minor
---

Hero takes `headingSize` (`own` | `h1` | `h2`): the level whose site size the heading takes when it is not the level it is written at. A page keeps one `h1`, so a source's second `h1` (a cover under the page title) is written as an `h2`; with `headingSize: 'h1'` it is still drawn at the theme's h1 size (endpopcorn home: 58px, not 52px). `own`, the default, changes nothing: the output is byte-identical to before.
