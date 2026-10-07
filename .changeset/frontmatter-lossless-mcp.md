---
"@contentrain/mcp": patch
---

`content_save` no longer erases frontmatter it cannot read (Turkish or spaced keys, nested maps, comments): they are written back as they were, and a saved value for such a key wins with an advisory. Reconcile sends documents holding such lines to the conflict path instead of merging them lossily, and `validate` warns per unreadable key (its `fix` path keeps them too).
