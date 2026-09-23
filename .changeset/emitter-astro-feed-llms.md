---
'@contentrain/emitter-astro': minor
---

The migrated site builds an RSS feed and an llms.txt. `/feed.xml` carries the 10 newest posts, as WordPress serves them at `/feed/`, and the theme's head link to the main feed now points at it; when the source head advertised its feed, the emit warns that `/feed/` needs a 301 to `/feed.xml` at the host. `/llms.txt` lists the site's name, tagline (`options.siteDescription`) and the newest 100 pages of each collection. Both are endpoints over the entry pages' own data, so each entry keeps its page's address. `options.feed: false` and `options.llms: false` turn them off.
