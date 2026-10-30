---
'@contentrain/wp-import': patch
---

Media `width`/`height` are written as whole numbers: WordPress stores a video's size as strings ("596"), which failed the media model's integer fields. A numeric value rounds; empty, `auto` or negative values are left out.
