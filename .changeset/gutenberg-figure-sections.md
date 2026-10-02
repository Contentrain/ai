---
"@contentrain/astro-kit": minor
---

Gutenberg section rules for figures, plans, steps, logos and quotes, and the engine support they need.

- `stats.columns`, `pricing.columns`, `steps.columns`, `testimonial.columns` (avatar per column) and `logo-cloud.images` join the Gutenberg table, ahead of the card grid that has the same leaves. A titled card grid inside a group is a card grid with that title.
- Section rules with `when.repeat: 'columns'` take slots with `scope: 'intro'` for the leaves above the row (a heading and a lead line); `SectionMeta.intro` carries them. A rule without a repeat reads them as the section's first leaves, as before.
- A slot can ask for `numeric: true | false`: the fact pack's `SectionLeaf.numeric` flag says a leaf's text is a figure (`1,200`, `99.99%`, `4 min`, `0`, `$29`). `ordinal` (a step's number: one or two digits) and `small` (a logo-sized image) work the same way. A flag the facts do not set reads as "no", so a rule that asks for one never fires on facts that predate it. Steps ask for `ordinal` — a timeline year is not a step number and the text stays — and logos for four or more `small` images.
- `validateMapping` rejects an intro slot without a repeat and a column item that reads an intro slot.
- Gutenberg table version 5 → 6.
