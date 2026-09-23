// Shared transport for the PUBLIC embed endpoints (forms, comments).
//
// These are called from a visitor's browser on someone else's site: no
// session, no API key — a page cannot keep a secret, and Studio's CORS for
// these routes allows only `Content-Type`, so an `Authorization` header would
// fail the preflight before the request is even sent. Errors come back as
// h3 error bodies (`{ statusCode, message, data? }`) or plain text; both become a
// `ContentrainError` carrying the HTTP status and, when the body has one, its
// machine code (`data.code`).

import { ContentrainError } from './errors.js'

/** The h3 error body's message and machine code (`data.code`), or the raw text. */
async function errorOf(res: Response, fallback: string): Promise<ContentrainError> {
  const text = await res.text().catch(() => '')
  let message = text || fallback
  let code: string | undefined
  try {
    const parsed = JSON.parse(text) as { message?: unknown; statusMessage?: unknown; data?: { code?: unknown } }
    const m = parsed.message ?? parsed.statusMessage
    if (typeof m === 'string' && m) message = m
    if (typeof parsed.data?.code === 'string') code = parsed.data.code
  } catch {
    // not JSON — the raw text is the message
  }
  return new ContentrainError(res.status, message, code)
}

export async function publicGet<T>(url: string): Promise<T> {
  const res = await globalThis.fetch(url)
  if (!res.ok) throw await errorOf(res, 'Request failed')
  return (await res.json()) as T
}

export async function publicPost<T>(url: string, body: unknown): Promise<T> {
  const res = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await errorOf(res, 'Request failed')
  return (await res.json()) as T
}

/** `baseUrl` without a trailing slash, path segments URL-encoded. */
export function publicUrl(baseUrl: string, segments: string[], query?: Record<string, string | number | undefined>): string {
  const path = segments.map((s) => encodeURIComponent(s)).join('/')
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return `${baseUrl.replace(/\/+$/, '')}/${path}${qs ? `?${qs}` : ''}`
}
