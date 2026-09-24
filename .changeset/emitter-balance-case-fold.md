---
'@contentrain/emitter-astro': patch
---

The chrome balance check no longer reports every `script`, `style`, `textarea` or `title` as never closed when text such as a Turkish `İ` comes before it. It looked for the closing tag in a lowercased copy of the fragment, and lowercasing `İ` adds a code unit, so the index it found pointed past the real closing tag. It now searches the fragment itself, matching the tag name by ASCII case as HTML does.
