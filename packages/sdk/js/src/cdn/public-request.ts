// Shared transport for the PUBLIC embed endpoints (forms, comments).
//
// These are called from a visitor's browser on someone else's site: no
// session, no API key — a page cannot keep a secret, and Studio's CORS for
// these routes allows only `Content-Type`, so an `Authorization` header would
// fail the preflight before the request is even sent. Errors come back as
// h3 error bodies (`{ statusCode, message }`) or plain text; both become a
// `ContentrainError` carrying the HTTP status.

import { ContentrainError } from './errors.js'

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(text) as { message?: unknown; statusMessage?: unknown }
    const message = parsed.message ?? parsed.statusMessage
    if (typeof message === 'string' && message) return message
  } catch {
    // not JSON — fall through to the raw text
  }
  return text || fallback
}

export async function publicGet<T>(url: string): Promise<T> {
  const res = await globalThis.fetch(url)
  if (!res.ok) throw new ContentrainError(res.status, await errorMessage(res, 'Request failed'))
  return (await res.json()) as T
}

export async function publicPost<T>(url: string, body: unknown): Promise<T> {
  const res = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ContentrainError(res.status, await errorMessage(res, 'Request failed'))
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
