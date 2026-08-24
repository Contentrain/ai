/** "f-archive" → "FArchive", "posts" → "Posts" — Astro component file names. */
export function pascalCase(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * Route pattern → Astro pages path.
 * `/` → `index.astro`; `/category/:term/page/:page` → `category/[term]/page/[page].astro`.
 * Returns null for patterns Astro's file routing cannot express (recorded as a warning upstream).
 */
export function patternToPagePath(pattern: string): string | null {
  if (pattern === '/' || pattern === '') return 'index.astro'
  if (pattern.includes('*')) return null
  const segments = pattern.replace(/^\/+|\/+$/g, '').split('/')
  const mapped = segments.map((seg) => (seg.startsWith(':') ? `[${seg.slice(1)}]` : seg))
  if (mapped.some((seg) => !/^[[\]a-zA-Z0-9._-]+$/.test(seg))) return null
  const last = mapped.pop()
  return [...mapped, `${last}.astro`].join('/')
}

const sortDeep = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, val]) => [k, sortDeep(val)]),
    )
  }
  return v
}

/** JSON with stable key order and trailing newline — deterministic output, stable diffs. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`
}
