---
"@contentrain/astro-kit": minor
---

Structured data by default. The Embed takes `schema` (on by default) to print a VideoObject (JSON-LD) for a named video: the title as name, a differing caption as description, the provider's page and player address, the local poster or else the YouTube still as thumbnail, and `uploaded` as uploadDate only when it is given; a map, a player or a video with no name prints none. The Faq's `schema` is now on by default too: the first FAQ on a page with an answered question prints the page's FAQPage, a later one on that page none; `schema={false}` turns either off.
