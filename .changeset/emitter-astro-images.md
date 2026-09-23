---
"@contentrain/emitter-astro": minor
---

Optimized images for migrated content.

Post bodies render as HTML (`set:html`), so `<Image>` never reached the pictures inside them. Each page's content now runs one build-time pass (`src/lib/optimize-images.ts`):
- Images on an allowed host go through `astro:assets` `getImage()`: WebP, a width-capped `srcset`, inferred `width`/`height`, and a default `sizes`. Allowed hosts are the runtime host, where migrated media is rehosted, plus `options.images.remotePatterns`.
- Every image gets `decoding="async"`. The first image is eager with `fetchpriority="high"`; the rest are lazy.
- Existing attributes are respected. SVG, GIF and `data:` images are never re-encoded, and a failed optimization keeps the original.

The same host list lands in `astro.config.mjs` as `image.remotePatterns`, and `sharp` is added to the dependencies. Theme chrome is untouched. `options.images.enabled: false` turns the pass off.
