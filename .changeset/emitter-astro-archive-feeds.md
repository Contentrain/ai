---
'@contentrain/emitter-astro': minor
---

Every archive page gets its feed, as in WordPress: a category, tag or author page builds `<archive>/feed.xml` with the newest posts it lists, links it in its head, and `<archive>/feed/` gets a 301 to it. The template head's own archive, comments and Atom feed links — one page's, or not built — are removed from the chrome.
