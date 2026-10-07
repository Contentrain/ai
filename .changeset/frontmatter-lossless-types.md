---
"@contentrain/types": minor
---

`parseMarkdownFrontmatter` now returns `preserved`: the frontmatter lines it cannot read (a key with a space or a non-ASCII letter, a nested map, a block scalar, a comment), verbatim and anchored to the field they followed. `serializeMarkdownFrontmatter(data, body, preserved?)` writes them back in place, CRLF included, and `preservedKeyConflicts` names the blocks a new value replaces. A key above a nested map is no longer read as an empty array.
