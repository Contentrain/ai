---
"@contentrain/emitter-astro": patch
---

The embedded forms client keeps a form the page already drew (its fields as HTML) in view while Studio's form loads, and on a failed load adds the error under it instead of wiping it; the same client as templates/astro-starter's `lib/studio/embed.ts`.
