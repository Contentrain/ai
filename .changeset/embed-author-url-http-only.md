---
"@contentrain/emitter-astro": patch
---

Comment embed: a commenter's website is linked only when it is an http(s) address. `javascript:`, `data:` and other schemes (also with a tab, a newline, mixed case or a leading space) render the name without a link; HTML escaping alone did not stop them. The starter's copy of the client is updated with it.
