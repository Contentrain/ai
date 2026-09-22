// Resolves stored `media/...` references — plain field values and the same
// references embedded in markdown — to absolute delivery URLs.
//
// The rewrite rules themselves (titled markdown embeds, inline HTML
// src/href, object/array field nesting) live once in `@contentrain/types`,
// shared with `@contentrain/mcp`'s write-time normalization — two
// independent implementations of "what counts as a media reference" is how
// they drift. This module only adapts that shared engine to this package's
// public shape: value-first arguments, and an optional/nullable base so a
// caller with nothing configured gets a plain no-op instead of having to
// guard the call itself.
//
// Framework-agnostic and side-effect free: the base is always supplied by
// the caller, never read from config or env here. That keeps this package
// unopinionated about where a host gets its base from — a generated client
// bakes one in at generate time, a Nuxt app reads it from
// `useRuntimeConfig()` per request, a script reads `process.env` — and it
// keeps this opt-in: no base means no-op, so a project that never configures
// one keeps relative paths exactly as stored.

import { rewriteMediaUrl, rewriteMarkdownMedia } from '@contentrain/types'

/**
 * Resolve a single field value. Non-string values, values that are not a
 * stored `media/...` path (already-absolute URLs included), and calls with no
 * base all pass through unchanged — safe to call on any field, idempotent on
 * a value it already resolved.
 */
export function resolveMediaUrl(value: unknown, mediaBaseUrl: string | null | undefined): unknown {
  if (!mediaBaseUrl) return value
  return rewriteMediaUrl(mediaBaseUrl, value)
}

/**
 * Resolve every `media/...` reference inside a markdown string — link and
 * image targets (`](media/...)`, titles included) and inline HTML
 * `src`/`href` attributes — to an absolute delivery URL. Any other target —
 * already absolute, or not a `media/...` path — is left untouched. No base is
 * a no-op.
 */
export function resolveMediaRefsInBody(markdown: unknown, mediaBaseUrl: string | null | undefined): unknown {
  if (typeof markdown !== 'string' || !mediaBaseUrl) return markdown
  return rewriteMarkdownMedia(markdown, mediaBaseUrl)
}
