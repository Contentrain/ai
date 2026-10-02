---
"@contentrain/astro-kit": minor
---

Right-to-left support: components use logical utilities (`ms-`/`ps-`/`start-`/`end-`/`border-s`/`text-start`) instead of left/right, the slider runs right to left on an RTL page (Embla `direction`), and pagination and slider arrows mirror under `dir="rtl"`. Left-to-right rendering is unchanged.
