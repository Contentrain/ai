---
"@contentrain/emitter-astro": patch
---

The comments client keeps a thread the page already drew (a migration's approved comments, rendered at build time) when Studio cannot answer, and shows no loading swap over it; Studio's answer still replaces it. The Astro starter draws those comments from `src/data/comments.json`, renders an unbound form with no address as an honest `needs_endpoint` block instead of nothing, and sends a form to WordPress only on the owner's explicit choice, as a live link.
