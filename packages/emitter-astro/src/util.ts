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
 * `/` → `index.astro`; `/category/:term/page/:page` → `category/[term]/page/[page].astro`;
 * a trailing `*` on a parameter makes it a rest parameter — `/category/:term*`
 * → `category/[...term].astro`, which is what keeps a nested taxonomy address
 * (`/category/about-cc/events/`) from collapsing to its last segment.
 * Returns null for patterns Astro's file routing cannot express (recorded as a warning upstream).
 */
export function patternToPagePath(pattern: string): string | null {
  if (pattern === '/' || pattern === '') return 'index.astro'
  const segments = pattern.replace(/^\/+|\/+$/g, '').split('/')
  // Literal Unicode segments preserve the source permalink. Validate literals
  // separately from parameters so widening the alphabet cannot admit traversal
  // or turn a source filename containing brackets into an Astro parameter.
  if (segments.some((seg) => seg.startsWith(':')
    ? !/^:[a-zA-Z0-9_]+\*?$/.test(seg)
    : seg === '.' || seg === '..' || !/^[\p{L}\p{M}\p{N}._-]+$/u.test(seg))) return null
  const mapped = segments.map((seg) => {
    if (!seg.startsWith(':')) return seg
    const rest = seg.endsWith('*')
    const name = seg.slice(1, rest ? -1 : undefined)
    return rest ? `[...${name}]` : `[${name}]`
  })
  const last = mapped.pop()
  return [...mapped, `${last}.astro`].join('/')
}

/** Index of the rest parameter segment in a page path, or -1. */
export function restParamIndex(pagePath: string): number {
  return pagePath.split('/').findIndex((seg) => seg.startsWith('[...'))
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
