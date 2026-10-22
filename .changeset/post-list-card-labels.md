---
"@contentrain/astro-kit": minor
---

PostList passes the source's read-more words and date style through to its cards: `readMoreLabel` (shown under each card's excerpt; the list's own `moreLabel` stays the archive link's text) and `dateStyle` (`full` / `long` / `medium` / `short`; absent, long). PostCard's excerpt line is capped at 62ch instead of 75ch: 75ch ran about 95 real characters a line, over the 90 the readability check allows.
