---
'@contentrain/astro-kit': minor
---

A section reads the way its source does: the page's text holds the source's words, in the source's order.

- **Steps:** an item takes a `number`, the step's number as the source writes it (`01`, `Step 2`). It is shown as written in place of the list's counter, and hidden from screen readers, which already count the `<ol>`. The Gutenberg and Elementor step rules carry it, so a migrated "01" stays "01" (it used to become a counter's "1"). Without it the list counts itself, as before.
- **Stats:** a new `order` variant, `label-first` (the default, as before) or `value-first`. `value-first` puts the figure first in the page's text: a plain list, since a `<dl>` names its term first. It is drawn the same either way, figure on top. The Gutenberg figure and Divi counter rules set `value-first`; the Elementor counter, which names itself first, keeps the default.
- **Testimonial:** the quotation marks are drawn with CSS (`open-quote`/`close-quote`, so they follow the page's language), not written into the quote's text. A screen reader reads them once at most, and the text is the source's words. A quote the source already wrote inside marks keeps its own and gets none added.
