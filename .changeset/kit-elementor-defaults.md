---
"@contentrain/astro-kit": minor
---

Elementor sections take the look of Elementor's own widget defaults, through variants the kit already has (Elementor table version 10). A source that kept those defaults now reads as it did:

- **Stats:** a counter's title is 19px in Elementor, so `labelSize: lg`.
- **Testimonial:** a testimonial's text is 1.3em in Elementor, so `quoteSize: xl`.
- **FAQ:** accordion and toggle titles are bold at body size in Elementor, so `questionStyle: bold`.
- **Team:** a person's role is a text-editor line at body size, so `roleStyle: plain`.
- **Icon list:** an icon list is a vertical list at body size in Elementor. It now maps to the feature list's `style: list`, where it used to be `icon` cards with headings.

The IP-4 Elementor golden scored these blocks under G9's 12% font-size tolerance.

**Testimonial grid:** two quotes now share the row on a wide screen. A third column used to stand empty beside them and narrow both.
