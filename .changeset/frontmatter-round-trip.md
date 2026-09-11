---
"@contentrain/types": patch
"@contentrain/query": patch
---

Frontmatter values survive a round trip — and both readers agree on them

A document's fields live in YAML frontmatter, and two readers open them: the
content engine through `parseMarkdownFrontmatter` (re-exported by
`@contentrain/mcp`), and `@contentrain/query`'s client generator and Astro
loader. The property both depend on is that a value written and read back is the
same value. For six shapes it did not hold:

| Value | Came back as |
|---|---|
| `He said "Hi"` | `He said \"Hi\"` — quotes stripped without decoding the escapes |
| `C:\path\to` | `C:\\path\\to`, doubling again on every further save |
| `line one` ⏎ `line two` | `line one` — the rest was written as frontmatter lines the reader then skipped |
| `  padded  ` | `padded` |
| `'42'` (a string) | `42` (a number) |
| `true` (a boolean) | `'true'` (a string) |

The first was reported as a release blocker by the WordPress Bridge, whose
document export now refuses to build a package rather than ship corrupted
metadata. The other five came out of writing the round-trip matrix for it — two
of them are silent data loss, and one changes a value's type on every save.

**Both readers had the same bug, which is why this is one change and not two.**
Each had its own copy of the scalar rules; fixing one would have turned a shared
bug into a silent disagreement between the generated client and the content
engine — worse than the bug. The grammar now lives in one place
(`parseFrontmatterScalar`, `parseFrontmatterScalarString`,
`splitFrontmatterList`, exported from `@contentrain/types`) and the SDK imports
it. A parity suite asserts both readers return the same values for the same
bytes.

What changed:

- Quoted scalars decode their escapes (`\\`, `\"`, `\n`, `\r`, `\t`, `\uXXXX`).
  An unrecognised escape keeps its backslash rather than erroring — hand-written
  frontmatter says `"C:\Users"` and losing that to strictness is a worse trade
  than keeping the bytes. Text that merely starts and ends with a quote
  (`"a" and "b"`) is not treated as one scalar, because slicing its ends off
  would corrupt it.
- A value carrying a newline, tab, backslash or edge whitespace is quoted and
  escaped, so it occupies one line.
- A *string* that would read back as another type is quoted; a real boolean,
  number or null is written bare, so each reads back as itself.
- An empty array is written `key: []`. A bare `key:` is genuinely ambiguous and
  the two readers were resolving it differently — one returned `[]`, the other
  `{}`.
- Inline arrays split on commas outside quotes, so `["a, b", c]` is two items.
  Empty items are kept instead of being dropped.
- The SDK's nested-value peek used `lines.indexOf(line)`, which finds the first
  line with that text rather than the current one; two identically spelled lines
  in one document made the second read the first one's successor.

Reading existing files is unchanged. The new spellings appear only when a
document is next written — where a value that used to be corrupted now is not,
so a diff on that line is the fix landing.
