---
"@contentrain/astro-kit": minor
---

Sections take the style a migration measured on the source page. `Section` has a `measured` prop (`MeasuredStyle`, the same fields as in `@contentrain/types`: frame width, padding, fill, background image with overlay, columns at 390/768/1280 px, gap, text tone, radius, minimum height). It becomes inline custom properties and the section's own box; without it a section renders exactly as before. Every value is checked first (`_shared/measured.ts`) and dropped when it is not a number in range, a colour, a safe image address or a known keyword.

New `band` component: the styled fallback section for a source section no closer component fits — heading, eyebrow, lead, image, a grid of items (figure, title, detail, text, points, image, icon, link) and buttons, in the measured frame. Every section component's `shared` list now includes `measured.ts`.
