---
"@contentrain/astro-kit": patch
---

Item headings no longer skip a level when a section has no heading of its own. `CardGrid`, `Steps`, `Pricing`, `Team`, `Tabs` and `FeatureList` print their item titles one level under the section heading, or at the section's level when there is none, the way `ContactForm` already did: a title-less card grid under a page's h1 now has h2 cards, not h3 (an Elementor icon-box row migrated as a grid). With a section heading nothing changes. The kit's visual run now also fails any fixture whose heading outline opens below its level or skips one.
