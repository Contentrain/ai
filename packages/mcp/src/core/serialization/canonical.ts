/**
 * Canonical JSON serialization — byte-deterministic output.
 *
 * Output rules:
 * - UTF-8
 * - 2-space indent
 * - Keys sorted alphabetically (recursive)
 * - Optional `fieldOrder` places named keys first, remaining keys alphabetical
 * - Trailing newline
 * - `null` and `undefined` values omitted (consistent with existing MCP output)
 *
 * See `.internal/refactor/03-conformance-contract.md` §2 for the full byte-level
 * contract. Any change here requires regeneration of all byte-parity fixtures
 * and review of every diff.
 */
export { canonicalStringify, sortKeys } from '@contentrain/types'

/**
 * Parse a canonical JSON string into a typed value.
 * Throws on syntactically invalid JSON.
 */
export function parseCanonical<T = unknown>(raw: string): T {
  return JSON.parse(raw) as T
}
