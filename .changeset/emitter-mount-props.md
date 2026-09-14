---
"@contentrain/emitter-astro": patch
---

A site that mounts a comments thread or a form builds again. The layout passes `html` to every mounted component since regions can be bound to a query, but the comments and form components did not declare it, so `astro check` — which the generated build runs first — failed with a type error on the mount and the build never started. Both components now accept it, and a test checks that every mountable component declares every prop the layout passes.
