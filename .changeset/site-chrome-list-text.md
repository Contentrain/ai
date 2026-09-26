---
'@contentrain/types': minor
'@contentrain/astro-kit': minor
---

A plan can now carry what a source theme prints around its content when the starter's own differs. `site.lists.text` sets the size of post bodies in a full list (Twenty Twenty-Five sets its query's post content to `medium`). `site.chrome` covers the header site title's size (`brand`), whether the header shows the tagline under the title (`tagline`), the footer's copyright line (`copyright`), and whether list titles take the link colour (`titleLinks`). The new `color-link` token role sets the link colour where it is not the accent (Hello Elementor's #c36 links).

`validateProjectPlan` accepts sizes only as CSS lengths or `clamp()`/`calc()`/`min()`/`max()` of lengths, and the copyright only as plain text.

In astro-kit, `Header` takes `tagline` and `brandSize`, and `PostCard` takes `linkTitle`. The starter reads each key only when it is set: with none of them set, it renders the same HTML as before.
