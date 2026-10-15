---
'@contentrain/astro-kit': minor
---

Hero gains `headingLines`. With `lines`, each line the author broke the heading into (a `\n`) is a block of its own, marked `data-kit-line="1"`, `"2"`, …, so a theme or a design layer can give a line its own ink, indent or size. It stays one heading, read as one sentence. The default, `flow`, prints the heading exactly as before. The new shared `Lines.astro` does the splitting, and other components can use it.
