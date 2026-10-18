---
"@contentrain/astro-kit": patch
---

Every section component takes an optional `entry`, the page entry it is built from (without its locale), and prints it on its section root as `data-kit-entry` next to `data-kit-section`. A design layer can then style one section, not only one kind. Absent, nothing is printed, so a site that passes none renders as before.
