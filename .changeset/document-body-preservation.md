---
"@contentrain/mcp": major
---

fix(mcp)!: a document save no longer replaces what it did not send

Saving a `document` entry rewrote the whole file from the payload. A save
carrying one frontmatter field wrote a file containing only that field — and
an empty body. The response said `valid: true`, because validation runs over
the plan's own output, which was internally consistent and wrong.

Reported from a live project: a 495-byte page reduced to its frontmatter by an
SEO-title edit. It was caught only because that project runs the review
workflow; under auto-merge it reaches the default branch unannounced.

Documents were the only kind that behaved this way. Collections and singletons
have always merged with what is on disk. They now match:

- frontmatter merges — a key the save does not mention is kept
- an absent `body` means "not editing the body" and the existing one is kept
- a `body` that is present, even empty, is honoured. Clearing real content
  that way now returns an advisory naming the character count and how to avoid
  it, because an explicit empty string is indistinguishable from a templating
  mistake and silence is what made the original bug expensive

Both write paths are fixed: `planContentSave` (every MCP tool, Studio, the
CLI) and the legacy `writeContent` (scaffold, normalize extract — extracting
into a model that already has documents would otherwise have replaced them).

The document branch also now reads its own accumulator before disk, as the
collection branch does, so two entries touching one document in a single call
compose instead of the second discarding the first.

BREAKING CHANGE: a caller that relied on `content_save` replacing a document
wholesale must now send `body` explicitly to clear it, and delete the entry
with `contentrain_content_delete` to remove frontmatter keys. Every other
caller gets the fix silently.
