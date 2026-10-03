---
"@contentrain/astro-kit": minor
---

**Testimonial: new `frame` axis (`card` | `plain`).** `card`, the default, is unchanged. `plain` sets the quote and who said it straight on the section, across the column, with no border, padding or surface. This is how Elementor's testimonial widget draws them. The Elementor table (version 11) now picks `plain` for testimonial sections and lone testimonial widgets. On a phone, the card's padding had narrowed the quote by a sixth (IP-4 Elementor launch G9).

**Faq:** `questionStyle: bold` now sets the question in bold. Before, its `font-bold` sat beside the summary's own arbitrary `font-weight`, and the CSS kept the heading weight.
