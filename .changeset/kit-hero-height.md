---
'@contentrain/astro-kit': minor
---

Hero gains `height` and `contentAt`. `height: 'screen'`: from sm (640px) up, the hero is at least the window's height (`100svh`, `100vh` where that is unknown) less `--header-h`, which a site that measures its header sets (0 without it). Below sm it is as tall as its content, as before. A boxed cover (`width: 'content'`) ignores it. `contentAt: 'end'`: in a hero taller than its content (screen-high, or a cover with its own height), the content sits on the bottom edge, the section's bottom padding under it. The defaults (`auto`, `start`) draw the hero as before.
