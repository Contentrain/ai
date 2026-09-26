---
'@contentrain/astro-kit': patch
---

`Faq`'s `plain` style sets its questions at the body size (`--text-body`, 1rem without it) instead of a fixed `text-base`, as WordPress's details block does: a migrated Twenty Twenty-Five FAQ read 16px where the source shows 18.27px.
