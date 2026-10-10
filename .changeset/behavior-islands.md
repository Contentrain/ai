---
"@contentrain/astro-kit": minor
---

Behavior islands: a source widget no component carries keeps working.
- `Behavior` takes the source's own markup (a rich-text field the migration has already cleaned) and makes it work with one small vanilla module, `_shared/behaviors.ts`. The kinds: disclosure, tablist, carousel, in-page dialog, count-up, toggle, filter, anchor links and an image lightbox.
- The module writes text only through `textContent`. It never uses `innerHTML`, `eval` or the network, and it reads only ARIA, `details` and the `data-cr-*` attributes the component prints from its props. It is loaded only on pages that have an island. Without it, or with a selector the browser refuses, the island stays as printed, every item in reading order.

`Dialog`:
- takes a `form` slot, for the popup's form (the starter's form, or its link to the form on WordPress);
- takes a `trigger` (`click`, `load`, `exit`, `scroll`). It still opens only by its button; the value stays on the root, so the gates and the receipt can say a popup that opened by itself now opens on click;
- takes a `fact` (`data-cr-fact`), which the gates find it by.

The starter's header stays at the top while scrolling where the source's did (`siteConfig.chrome.header.sticky`, Header `position="sticky"`). The kit's Header had the option, but the starter never passed it, so a sticky source header scrolled away.
