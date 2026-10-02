---
"@contentrain/astro-kit": minor
---

Elementor section rules for rows of steps, plans and people.

- `steps.columns` (a row of numbered steps: `layout: row`, `style: numbered`), `pricing.columns` (a name, a figure price, a period, a feature list and a button per column) and `team.columns` (a portrait, a name and a role per column) join the Elementor table. Each reads a heading above a row of containers as the section's intro, the same way the Gutenberg rules do.
- A slot can ask for `portrait: true | false`: the fact pack's `SectionLeaf.portrait` flag says an image is a square-ish photo at least 200px across. The team rule asks for it, so a card grid with pictures is not taken for people. As with `numeric`, `ordinal` and `small`, a flag the facts do not set reads as "no": none of the new rules fires on facts that do not split Elementor rows or flag their leaves.
- Elementor table version 7 → 8.
