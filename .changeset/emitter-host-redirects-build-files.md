---
'@contentrain/emitter-astro': patch
---

A host-only rule (`hostRedirects`) is never written over a file the build writes — robots.txt, llms.txt, a feed, the sitemap files, 404.html, `/_astro/`, `/styles/` (either slash form, any letter case): a host file answers before the filesystem, so it would shadow the file. Such a rule is returned in `EmitResult.redirects.manual`.
