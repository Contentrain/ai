---
'@contentrain/astro-kit': minor
---

Split's edge bleed (`imageBleed: 'edge'`) now reaches the window's edge on screens wider than 1216 px. It used to stop 32 px short there: the rule assumed the page frame's gutter sat outside its 76rem width, but it sits inside. The rule now lives in `_shared/bleed.ts`, shared with Hero's `imageBleed`.
