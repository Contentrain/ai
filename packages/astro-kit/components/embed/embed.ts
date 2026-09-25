// What an embed URL becomes: the player/map address the iframe loads after a
// click, the page a plain link opens without JavaScript, and the provider.
// Only known providers get an iframe; anything else stays a link, so a page
// can never frame an arbitrary address that came in with the content.

export type EmbedProvider = 'youtube' | 'vimeo' | 'google-maps' | 'openstreetmap' | 'spotify' | 'soundcloud' | 'calendly' | 'typeform' | 'loom' | 'wistia'

export interface EmbedTarget {
  provider: EmbedProvider
  /** Loaded into the iframe on activation (autoplays where the provider allows it: the click was the consent). */
  src: string
  /** Opened by the plain link: the provider's own page. */
  href: string
  kind: 'video' | 'map' | 'audio' | 'widget'
  /** YouTube Shorts and other vertical players. */
  portrait?: boolean
}

const https = (value: string): URL | null => {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  }
  catch { return null }
}

const YOUTUBE_ID = /^[\w-]{11}$/
/** `t=1m30s`, `t=90`, `start=90` → seconds. */
const seconds = (value: string | null): number => {
  if (!value) return 0
  if (/^\d+$/.test(value)) return Number(value)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
}

function youtube(url: URL): EmbedTarget | null {
  const host = url.hostname.replace(/^(?:www|m)\./, '')
  let id: string | null = null
  let portrait = false
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [first, second] = url.pathname.split('/').filter(Boolean)
    if (first === 'watch') id = url.searchParams.get('v')
    else if (first === 'embed' || first === 'live' || first === 'v') id = second ?? null
    else if (first === 'shorts') { id = second ?? null; portrait = true }
  }
  if (!id || !YOUTUBE_ID.test(id)) return null
  const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'))
  const query = new URLSearchParams({ autoplay: '1', rel: '0' })
  if (start) query.set('start', String(start))
  return {
    provider: 'youtube',
    kind: 'video',
    src: `https://www.youtube-nocookie.com/embed/${id}?${query}`,
    href: portrait ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`,
    ...(portrait ? { portrait } : {}),
  }
}

function vimeo(url: URL): EmbedTarget | null {
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  const at = parts[0] === 'video' ? 1 : parts.findIndex(p => /^\d+$/.test(p))
  const id = parts[at]
  if (!id || !/^\d+$/.test(id)) return null
  // Unlisted videos carry a hash: `vimeo.com/123/abcdef` or `?h=abcdef`.
  const hash = url.searchParams.get('h') ?? (parts[at + 1] && /^[\da-f]+$/i.test(parts[at + 1]!) ? parts[at + 1]! : null)
  const query = new URLSearchParams({ autoplay: '1', dnt: '1' })
  if (hash) query.set('h', hash)
  return { provider: 'vimeo', kind: 'video', src: `https://player.vimeo.com/video/${id}?${query}`, href: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}` }
}

const GOOGLE = new Set(['www.google.com', 'google.com'])

/** Framed as given: the host is known to serve an embeddable page at that address. */
const FRAMED: Array<[EmbedProvider, EmbedTarget['kind'], (url: URL) => boolean]> = [
  // Exact hosts only: a pattern over Google's country domains also admits look-alikes (`google.com.evil.example`).
  ['google-maps', 'map', u => (GOOGLE.has(u.hostname) && u.pathname.startsWith('/maps/embed')) || (u.hostname === 'maps.google.com' && u.searchParams.get('output') === 'embed')],
  ['openstreetmap', 'map', u => u.hostname === 'www.openstreetmap.org' && u.pathname === '/export/embed.html'],
  ['spotify', 'audio', u => u.hostname === 'open.spotify.com' && u.pathname.startsWith('/embed/')],
  ['soundcloud', 'audio', u => u.hostname === 'w.soundcloud.com' && u.pathname.startsWith('/player')],
  ['calendly', 'widget', u => u.hostname === 'calendly.com'],
  ['typeform', 'widget', u => /^[\w-]+\.typeform\.com$/.test(u.hostname) && u.pathname.startsWith('/to/')],
  ['loom', 'video', u => /^(?:www\.)?loom\.com$/.test(u.hostname) && u.pathname.startsWith('/embed/')],
  ['wistia', 'video', u => u.hostname === 'fast.wistia.net' && u.pathname.startsWith('/embed/')],
]

/** A video page or player URL, or a known provider's embed address. `null` = not embeddable. */
export function embedTarget(value: string): EmbedTarget | null {
  const url = https(value)
  if (!url) return null
  const found = youtube(url) ?? vimeo(url)
  if (found) return found
  url.protocol = 'https:'
  for (const [provider, kind, test] of FRAMED) if (test(url)) return { provider, kind, src: url.href, href: url.href }
  return null
}

/** A Google map of a place or address (what Elementor's and Divi's map widgets store). */
export function mapTarget(address: string): EmbedTarget | null {
  const q = address.trim()
  if (!q) return null
  const query = encodeURIComponent(q)
  return { provider: 'google-maps', kind: 'map', src: `https://www.google.com/maps?q=${query}&output=embed`, href: `https://www.google.com/maps/search/?api=1&query=${query}` }
}
