---
"@contentrain/astro-kit": patch
---

Four testimonial section rules in the mapping tables (gutenberg `testimonial.columns` and `testimonial.quotes`, elementor and divi `testimonial.quotes`) listed `props` twice, and the last one won, so their `ui:testimonial.rating` and `ui:testimonial.label` bindings were never read. The two objects are merged. A new test reads every mapping table as raw text and fails on a key repeated within an object.
