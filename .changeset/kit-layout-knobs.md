---
'@contentrain/astro-kit': minor
---

New layout and size variants for the sections a rebuilt page could not match. All of them are additive, and every default renders as before:

- Hero `leadAlign: start` keeps the lead at the start edge under a centred heading.
- FeatureList `style: list` is a one-column icon list at the body size, with titles as text.
- Cta `layout: stacked` puts heading, text and buttons in one left-aligned column. Cta `tone: none` has no fill, and Section takes `tone: none` too.
- Testimonial `quoteSize` (`base`, `lg`, `xl`) sets the quote size.
- Faq `questionStyle: bold` sets the questions at the body size in bold.
- Stats `labelSize` (`base`, `lg`) sets the figure labels.
- Team `roleStyle: plain` shows the role as body-size text in the text colour.

A split hero without an image now spans the whole row instead of half of it.
