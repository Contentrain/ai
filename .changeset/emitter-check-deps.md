---
'@contentrain/emitter-astro': patch
---

The emitted `package.json` lists `@astrojs/check` and `typescript` under `dependencies`, not `devDependencies`. The site's `build` script runs `astro check`, and an install with `NODE_ENV=production` (a worker image, a host's production build) leaves devDependencies out: Astro then asks to install the checker, so with no terminal the build fails, and with `CI` set `astro check` exits 0 without checking anything.
