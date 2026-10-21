---
"@contentrain/astro-kit": patch
---

A carousel island no longer has a dead button: it does not loop (owl's own default), so Previous is disabled (with `aria-disabled`) on the first slide and Next on the last, updated as the track scrolls (buttons, swipe or keys) and when it is first laid out (a carousel inside a closed tab keeps both on until it has a width). Before, both were always on and Previous on the first slide did nothing. A disabled control is drawn faded.
