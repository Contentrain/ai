---
'@contentrain/emitter-astro': minor
---

`EmitInput.hostRedirects`: rules served only by the host's redirect file (`public/_redirects`, `vercel.json`), never by `astro.config`, so the static build writes no meta-refresh page for them — for bulk rules such as one per WordPress attachment page. Same checks as `redirects`; the site's own rules and the feed redirects win a shared address and come first in a limited host file. A host-only rule the host file cannot hold (a pattern, past the Cloudflare/Vercel limit) is returned in `EmitResult.redirects.manual`.
