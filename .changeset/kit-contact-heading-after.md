---
"@contentrain/astro-kit": minor
---

Contact section: output order follows the source. `contact-form` gains a `headingPlace` variant (`top` by default, byte-identical to before; `after` puts the heading after the introduction and the details, titling the form beside one, following the details without one). A new Gutenberg section rule, `contact-form.intro-first`, tried before `contact-form.form`, applies it when the source writes the lead paragraph before the heading (tt5 /contact/: text, "Email the studio" button, heading, form); with the heading first the rule that was there is unchanged.
