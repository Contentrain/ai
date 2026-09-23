---
'@contentrain/emitter-astro': minor
---

The migrated site builds an RSS feed and an llms.txt. `/feed.xml` carries the 10 newest posts, as WordPress serves them at `/feed/`, the theme's head link to the main feed now points at it, and `/feed/` gets a 301 to it in `astro.config` and the host's redirect file. `/llms.txt` lists the site's name, tagline (`options.siteDescription`) and the newest 100 pages of each collection, leaving out those kept out of search. Both are endpoints over the entry pages' own data, so each entry keeps its page's address. `options.feed: false` and `options.llms: false` turn them off.
