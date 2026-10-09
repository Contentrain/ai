---
'@contentrain/astro-kit': minor
---

Four optional fields for text a migration read on the source but had nowhere to put, each empty by default so a section without it renders as before:

- `hero` gains `items`: short points under the lead, before the buttons, each a `title` with an optional `icon` (a hero's "Fast, easy and painless" list).
- `card-grid` items gain `linkLabel`: the link's own text under the card ("Get a quote"); with it the title is plain text and the labelled link is the card's link, as in `band`. Without it the whole card is still the link.
- `split`'s `heading` is optional: a block of text beside an image with no heading of its own renders without one (and without `aria-labelledby`).
- `footer` keeps line breaks in the tagline (an about line with a credit under it). Its `contact` gains `labels` (the words printed before the address, phone or email: "Telefon:", "Email:") and `order` (the details in the source's order; absent, address, phone, email). The starter's `siteConfig.contact` takes `labels` (the site fields that hold those words, so they are edited in Studio) and `order`, and passes them through `siteContact`.
