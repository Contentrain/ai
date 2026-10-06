---
"@contentrain/mcp": patch
---

fix(mcp): an untranslated entry of an i18n collection is a warning, not an error

`contentrain_validate` reported `Entry parity` — an entry one locale file has and another lacks — as an error, so a partly translated project never validated. That is the normal state of a site imported from WPML or Polylang, where a translation exists only for the posts someone translated. It is now a warning, as a document's missing translation already was.

Unchanged: a locale with no content file (`Locale file missing`) and a dictionary key missing from a locale (`Key parity`) are still errors, and the message text is the same.
