---
'@contentrain/wp-import': patch
---

`rawToContentrain` no longer names a site "Site" when the source gives no title. With neither a REST index name nor a WXR channel title, the `site` entry has no `title` (the field stays required, so the store shows what is missing) and the report's new `site_title_missing` is `true`.
