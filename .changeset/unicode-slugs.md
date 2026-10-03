---
"@contentrain/types": minor
"@contentrain/wp-import": minor
---

A slug is the page's address, so it keeps its script. `SLUG_PATTERN` / `validateSlug` accept lowercase letters, digits and combining marks of any language (NFC, at most 200 bytes, hyphens between words); ASCII slugs are exactly what they were. `@contentrain/wp-import` writes a post's or term's WordPress `post_name` as the source site served it — Japanese, Arabic, Turkish `ış`, German `ß`/`ü` — instead of dropping non-ASCII letters and falling back to `post-<id>`. A slug that leaves no word, or collides, still falls back (the suffix is fitted inside the 200-byte limit), and the report's new `slug_moves` names each such post's old address (`from`) so a 301 can be written; a slug rewritten for characters outside the alphabet (ZWNJ/ZWJ, `・`, NFD) is reported the same way, as `rewritten`. ASCII slugs import byte-identically (an accented Latin slug now keeps its accent, as the source served it). Entry ids of posts that used to fall back to `post-<id>` change with their slug.
