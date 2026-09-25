---
'@contentrain/emitter-astro': patch
---

The emitted `src/lib/embed.ts` type-checks under `exactOptionalPropertyTypes` (Astro's `strictest` preset): a comments mount without `data-locale` leaves `locale` out of its entry address instead of setting it to `undefined`. Same request on the wire.
