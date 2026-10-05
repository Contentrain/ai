---
"@contentrain/astro-kit": minor
---

Text in the accent reads a new `--color-accent-text` token (an inverse section: `--color-accent-text-inverse`) instead of `--color-accent`. Both default to the accent in the starter, so nothing changes until a site sets them; a site whose accent is too light for text on its surface (lime on white) sets a readable one while buttons and fills keep the accent.
