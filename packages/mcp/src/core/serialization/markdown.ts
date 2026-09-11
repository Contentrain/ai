/**
 * Markdown frontmatter serialization — for document-kind content.
 *
 * YAML frontmatter is a minimal subset: string, number, boolean, null, and
 * arrays thereof. Nested objects are intentionally unsupported to keep the
 * round-trip deterministic.
 *
 * Multi-line strings are supported, on one line: a newline is written as `\n`
 * inside a quoted scalar and decoded on the way back. They used to be
 * "unsupported" in the worst sense — the rest of the value was written into the
 * frontmatter as lines the reader then skipped, so the value came back
 * truncated at its first newline with nothing reported.
 *
 * The implementation lives in `@contentrain/types` and is shared with
 * `@contentrain/query`'s generator and Astro loader, because how a value is
 * spelled on disk is a contract rather than an implementation detail.
 */
export { parseMarkdownFrontmatter, serializeMarkdownFrontmatter } from '@contentrain/types'
