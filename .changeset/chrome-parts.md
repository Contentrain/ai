---
"@contentrain/types": minor
---

`site.chrome.parts: true`: the header and footer are a block theme's template parts, sized by the theme's presets (the footer's site title at the h2 size), even when the plan also carries measures read off the render (`header`, `footerColumns`). Until now a writer could only tell a block theme by `chrome` being absent, and since those measures are read for block themes too, a Twenty Twenty-Five footer printed its site title at the body size. Absent, plans keep that reading.
