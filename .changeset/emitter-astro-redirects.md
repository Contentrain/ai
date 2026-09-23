---
'@contentrain/emitter-astro': minor
---

Redirects: `EmitInput.redirects` (the site's `RawIR.redirects`) writes plain one-to-one rules (301/302/307/308) to `astro.config` `redirects`. Patterns, regular expressions, other statuses, query-string or file-name `from`s, and rules on an address the migrated site builds a page at come back in `EmitResult.redirects.manual` with the reason, to set up at the host. The rules are also written as real HTTP redirects into the host's file (`options.redirectHost`: Netlify `public/_redirects` forced, Cloudflare Pages `public/_redirects`, Vercel `vercel.json`; unset writes Netlify and Vercel), with the meta-refresh pages as the fallback; `EmitResult.redirects.host_files` names them.
