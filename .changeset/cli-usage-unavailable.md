---
'contentrain': patch
---

`contentrain studio usage` shows a meter Studio could not read as "unavailable" (no number, no percentage) instead of printing `null` or a false 0. Studio's usage endpoint now answers such a meter with `current: null` and `unavailable: true`.
