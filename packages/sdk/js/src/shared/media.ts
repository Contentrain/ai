// Resolves stored `media/...` references — plain field values and the same
// references embedded in markdown — to absolute delivery URLs.
//
// Framework-agnostic and side-effect free: the base is always supplied by the
// caller, never read from config or env here. That keeps this package
// unopinionated about where a host gets its base from — a generated client
// bakes one in at generate time, a Nuxt app reads it from
// `useRuntimeConfig()` per request, a script reads `process.env` — and it
// keeps this opt-in: no base means no-op, so a project that never configures
// one keeps relative paths exactly as stored.

const MEDIA_PREFIX = 'media/'

function trimBase(mediaBaseUrl: string): string {
  return mediaBaseUrl.replace(/\/+$/, '')
}

/**
 * Resolve a single field value. Non-string values, values that are not a
 * stored `media/...` path (already-absolute URLs included), and calls with no
 * base all pass through unchanged — safe to call on any field, idempotent on
 * a value it already resolved.
 */
export function resolveMediaUrl(value: unknown, mediaBaseUrl: string | null | undefined): unknown {
  if (typeof value !== 'string' || !value.startsWith(MEDIA_PREFIX)) return value
  if (!mediaBaseUrl) return value
  return `${trimBase(mediaBaseUrl)}/${value}`
}

// `[text](media/...)` and `![alt](media/...)` share the same `](media/...)`
// shape, so one pattern resolves both markdown links and image embeds.
const MEDIA_REF_RE = /\]\((media\/[^)\s]+)\)/g

/**
 * Resolve every `](media/...)` reference inside a markdown string to an
 * absolute delivery URL. Any other link or image target — already absolute,
 * or not a `media/...` path — is left untouched. No base is a no-op.
 */
export function resolveMediaRefsInBody(markdown: unknown, mediaBaseUrl: string | null | undefined): unknown {
  if (typeof markdown !== 'string' || !mediaBaseUrl) return markdown
  const base = trimBase(mediaBaseUrl)
  return markdown.replace(MEDIA_REF_RE, (_match, path: string) => `](${base}/${path})`)
}
