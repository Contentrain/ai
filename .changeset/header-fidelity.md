---
'@contentrain/astro-kit': minor
'@contentrain/types': minor
---

The header takes what the source's header does differently, each only where it does: `Header` gains `bordered` (no line under the bar), `brandWeight` and `brandTracking` (the site name), `offsetTop`, `padTop` and `padBottom` (the space above and inside the bar). `site.chrome.header` carries them in the plan, validated (weights, letter-spacings and CSS lengths only; never `url()`); without it the starter's header is exactly as before.
