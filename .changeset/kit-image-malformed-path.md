---
'@contentrain/astro-kit': patch
---

`KitImage` no longer fails a page's build on an image path with a malformed percent escape. Such an image stays a plain `<img>`.
