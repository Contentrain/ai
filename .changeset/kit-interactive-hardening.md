---
"@contentrain/astro-kit": minor
---

`slider`, `tabs` and `faq` take the measured style (`measured`: columns, gap, padding), and `slider` and `tabs` take an optional section header (`heading`, `intro`, `eyebrow`, `actions`, drawn by the shared `SectionHeader`; without one the markup is unchanged). The slider's previous and next buttons carry `aria-controls`, its viewport is keyboard reachable, and `tabs.label` joins the interface strings in all 16 languages.

Mapping tables gain carousel rules (Swiper, Slick, Splide, Owl, Elementor nested and loop carousels), `classic/details` for faq, testimonial-carousel and reviews rules, and `classic/aria-tabs`. Tabs rules read panels with `html@root:<selector>`, which `MAPPING_VALUE_PATTERN` now accepts.
