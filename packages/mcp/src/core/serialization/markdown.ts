/**
 * Markdown frontmatter serialization — for document-kind content.
 *
 * YAML frontmatter is a minimal subset: string, number, boolean, null, and
 * arrays thereof. Nested objects and multi-line strings are intentionally
 * unsupported to keep the round-trip deterministic.
 */
export { parseMarkdownFrontmatter, serializeMarkdownFrontmatter } from '@contentrain/types'
