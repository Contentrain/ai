---
'@contentrain/astro-kit': patch
---

The header's brand fits a phone: a wide logo or a long site name is cut to the space left beside the menu button instead of being drawn over it (the brand may shrink, the logo is capped at its width, the name truncates). The starter's BaseLayout shows the site name only where the site has no logo, as a WordPress custom logo replaces the title. A header fixture with a wide logo and a long name is added, and the visual check fails a header that overflows at 390 px or whose menu button a tap cannot reach.
