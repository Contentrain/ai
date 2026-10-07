// Every address a kit component prints (href, action, src, formaction, poster) passes through here. A site's content
// is text a person or a migration wrote, so an address can be `javascript:…` or `data:text/html,…`; Astro escapes
// quotes but never looks at the scheme. Allowed: http, https, mailto, tel, and anything with no scheme (`/path`,
// `./x`, `../x`, `?q=1`, `#top`, `//host/x`). Anything else is refused: `safeUrl` gives `undefined` (drop the
// attribute), `safeHref` gives `#` (the link stays, harmless).
//
// The check reads an address the way a browser does before it looks for a scheme: character references decoded
// (`&#106;avascript:`, `javascript&colon;`), leading and trailing control characters and spaces removed, and every
// tab and line break removed wherever it sits (`java<TAB>script:`).

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
/** A raster image written inline; SVG and HTML are not allowed (they can carry script). */
const INLINE_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif)[;,]/

const NAMED: Record<string, string> = { colon: ':', tab: '\t', newline: '\n', amp: '&', lpar: '(', rpar: ')', sol: '/', num: '#', quot: '"', apos: '\'', lt: '<', gt: '>', nbsp: ' ' }

function decodeOnce(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,8}));?/g, (whole, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    const code = dec ? Number(dec) : hex ? Number.parseInt(hex, 16) : undefined
    if (code !== undefined) return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ''
    return name !== undefined && name.toLowerCase() in NAMED ? NAMED[name.toLowerCase()]! : whole
  })
}

/** The address as a browser would see it before reading its scheme. */
function probe(value: string): string {
  let text = value
  // References can be nested (`&amp;#106;`): decode until nothing changes, a few rounds at most.
  for (let round = 0; round < 4; round++) {
    const next = decodeOnce(text)
    if (next === text) break
    text = next
  }
  // oxlint-disable-next-line no-control-regex
  return text.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '')
}

function schemeOf(value: string): string | undefined {
  return /^([a-z][a-z0-9+.-]*):/i.exec(probe(value))?.[1]?.toLowerCase()
}

/** In `astro dev` (not in a build or a test) a refused address says so, with the scheme it was refused for. */
function refused(scheme: string): undefined {
  const mode = (import.meta as { env?: { DEV?: boolean, MODE?: string } }).env
  if (mode?.DEV && mode.MODE !== 'test') console.warn(`[astro-kit] refused an address with the "${scheme}:" scheme; allowed: http, https, mailto, tel and relative addresses.`)
  return undefined
}

/** The address if it is safe to print as a link or form target; otherwise `undefined` (leave the attribute off). */
export function safeUrl(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value)
  const scheme = schemeOf(text)
  return scheme === undefined || SAFE_SCHEMES.has(scheme) ? text.trim() : refused(scheme)
}

/** The address if it is safe; otherwise `#`, so a link keeps its place and goes nowhere. */
export function safeHref(value: string | null | undefined): string {
  return safeUrl(value) ?? '#'
}

/** As `safeUrl`, for an image or media source: also an inline raster image (`data:image/png;base64,…`). */
export function safeSrc(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value)
  return INLINE_IMAGE.test(probe(text).toLowerCase()) ? text.trim() : safeUrl(text)
}
