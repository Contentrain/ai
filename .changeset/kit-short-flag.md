---
"@contentrain/astro-kit": minor
---

A slot can now ask for `short: true | false`. The fact pack's `SectionLeaf.short` flag means the leaf's text is one short line: a name, a role or a label, at most 40 characters and with no line break.

The Elementor `team.columns` rule (table version 9) now asks for it on the role. A row of square product or service photos with a title and a description is therefore no longer taken for people.

As with `numeric`, `ordinal`, `small` and `portrait`, a flag the facts do not set reads as "no". Facts that do not flag short text will not fire the team rule.
