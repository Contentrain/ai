---
"@contentrain/astro-kit": minor
---

`Stats` counts up where the source's counter did: `motion: "count"` (opt-in; default `static`). The Elementor and Divi counter mapping rules set it.
- The figure list becomes a `countup` behaviour island, wired by the existing `_shared/behaviors.ts`. Each figure's digits are their own span; its prefix, suffix and icon stay as printed.
- The final number is in the HTML: crawlers, screen readers, search and a page without JavaScript read it.
- Nothing moves under `prefers-reduced-motion: reduce` or without IntersectionObserver. The count starts only when the figure scrolls into view, once.
- The module loads only on a page with a counting Stats (`_shared/BehaviorScript.astro`); a static Stats ships no script.
