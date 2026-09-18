// ─── Shaping helpers ───
//
// What a shaper does to free text before it may leave the process: URLs,
// e-mail addresses and root-relative paths become placeholders, whitespace
// collapses, and the text is cut to a length the decision can use.

const URL = /\b(?:https?|ftp):\/\/\S+|\bwww\.\S+/gi
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
// A root-relative path: a slash at the start or after a space/bracket/quote, then a segment.
const PATH = /(^|[\s("'=])\/[\w.~%-]+(?:\/[\w.~%-]*)*/g

export function scrubText(text: string, max: number): string {
  const clean = text
    .replace(URL, '<url>')
    .replace(EMAIL, '<email>')
    .replace(PATH, '$1<path>')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** A slug-like identifier (post-type name, family name): lower-case word characters and dashes only. */
export function scrubSlug(value: string, max = 40): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max)
}

/** A finite number, or undefined. */
export function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
