---
"@contentrain/astro-kit": minor
---

Gutenberg mapping: the contact section (`contact-form.form`) takes up to three buttons as the section's contact details (`details` slot on `core/button`, each read as `value` from the link text and `href` from its link), as the Elementor rule already does with its icon list. A page of text, a mailto button, a heading and a form (tt5 contact) was no contact section: the button was a leaf no slot claimed, so the intro and the form came out as two sections and the mailto went into a prose block. A section with no button maps exactly as before (same rule, same filled slots, no `details` array in the extracted content); a fourth button, or a button with no form, is not this section.
