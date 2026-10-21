---
"@contentrain/astro-kit": patch
---

A carousel island no longer has a dead button: it does not loop (owl's own default), so Previous is disabled (with `aria-disabled`) on the first slide and Next on the last, updated as the track scrolls (buttons, swipe or keys) and whenever the track or a slide resizes or the page finishes loading. Only a row measured wider than its frame has ends: one that does not overflow yet (inside a closed tab, or a frame still as wide as its slides) keeps both on, so the buttons are never left off on a carousel that can move. Before, both were always on and Previous on the first slide did nothing. A disabled control is drawn faded.
