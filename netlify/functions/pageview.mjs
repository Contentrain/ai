// Page views for ai.contentrain.io, without an analytics script or cookies.
//
// The page (`docs/.vitepress/theme/pageview.ts`) posts `{ path, entry, referrer, utm }` here; this function turns it into
// PostHog's `$pageview` keys and sends it from the server, to the same EU project as migrate.contentrain.io. The same
// file runs on contentrain.io, docs.contentrain.io and ai.contentrain.io, with only `SITE` and `LIB` changed; the shared
// contract is migrate's too. What leaves is a pattern or a class, never the visitor's own:
//
// - `site`, which of the four sites sent it;
// - the path, only when it is a plain lowercase route (`/pricing`, `/guide/`); anything else is refused;
// - `entry`, true on the first page of a page load: visits are entries, pages per visit is views ÷ entries;
// - the referrer as a known source (`google.com`, `chatgpt.com`, …), `$direct` or `other`, never the host itself;
// - `utm_source`/`medium`/`campaign`/`content` as short tokens; `utm_term` and click ids never;
// - the browser family, OS family and device class; no version, and the user agent is neither sent nor logged;
// - the country the edge resolved, not the address.
//
// The id is a daily visitor id: HMAC(daily salt, IP + UA), the salt being HMAC(`ANALYTICS_SALT_SECRET`, UTC date). The
// same visitor gets the same id on all four sites for one UTC day and a new one the next; without the secret, no day's
// id can be recomputed. The IP and user agent are only hashed, never sent or kept. No secret (or no IP) → a random id
// per page view. `$process_person_profile: false` either way: no person, nothing stored in the browser.
//
// Not counted (204, nothing sent): a deploy that is not production or a `*.netlify.app` host, a crawler or monitor, and
// an emulated Chrome (Lighthouse), whose `sec-ch-ua` lacks the GREASE brand every real Chromium browser adds.
// No `POSTHOG_KEY` or `POSTHOG_HOST` → 204 with `x-analytics: off`, and the page stops sending.

import { createHmac } from 'node:crypto'
import { BlockList, isIP } from 'node:net'

const SITE = 'ai'
const LIB = 'contentrain-ai-docs'
const MAX_BYTES = 2048
const UTM_KEYS = ['source', 'medium', 'campaign', 'content']
/** migrate's `server/utils/crawler.ts`, kept identical so all four sites drop the same set. */
const CRAWLER = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python|node-fetch|axios|go-http|java\/|okhttp|httpclient|monitor|uptime/i

/** Sources worth naming, by the host's end. Anything else is `other`: an unknown host may name a person. */
const KNOWN_SOURCES = [
  [/(^|\.)gemini\.google\.com$/, 'gemini.google.com'],
  [/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/, 'google.com'],
  [/(^|\.)bing\.com$/, 'bing.com'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo.com'],
  [/(^|\.)yandex\.[a-z]{2,3}$/, 'yandex.com'],
  [/(^|\.)baidu\.com$/, 'baidu.com'],
  [/(^|\.)ecosia\.org$/, 'ecosia.org'],
  [/(^|\.)search\.brave\.com$/, 'search.brave.com'],
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'chatgpt.com'],
  [/(^|\.)perplexity\.ai$/, 'perplexity.ai'],
  [/(^|\.)claude\.ai$/, 'claude.ai'],
  [/(^|\.)copilot\.microsoft\.com$/, 'copilot.microsoft.com'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin.com'],
  [/(^|\.)news\.ycombinator\.com$/, 'news.ycombinator.com'],
  [/(^|\.)reddit\.com$/, 'reddit.com'],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'x.com'],
  [/(^|\.)(facebook\.com|fb\.com)$/, 'facebook.com'],
  [/(^|\.)youtube\.com$/, 'youtube.com'],
  [/(^|\.)producthunt\.com$/, 'producthunt.com'],
  [/^github\.com$/, 'github.com'],
  [/(^|\.)npmjs\.com$/, 'npmjs.com'],
  [/(^|\.)wordpress\.org$/, 'wordpress.org'],
  [/(^|\.)contentrain\.io$/, 'contentrain.io'],
]

function referrerSource(host) {
  if (!host) return '$direct'
  const h = host.toLowerCase().replace(/\.$/, '')
  for (const [match, name] of KNOWN_SOURCES) if (match.test(h)) return name
  return 'other'
}

/** A campaign tag that is a short token and cannot carry a person: no address, no long number, no long hex. */
function utmValue(value) {
  const v = value.trim().toLowerCase()
  if (!/^[a-z0-9._-]{1,64}$/.test(v)) return undefined
  if (/\d{6,}/.test(v) || /[a-f0-9]{16,}/.test(v)) return undefined
  return v
}

function userAgentClass(ua) {
  if (!ua) return { $browser: 'Other', $os: 'Other', $device_type: 'Desktop' }
  if (CRAWLER.test(ua)) return null
  const $browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Microsoft Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
      : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
              : 'Other'
  const $os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
      : /CrOS/.test(ua) ? 'Chrome OS'
        : /Windows/.test(ua) ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua) ? 'Mac OS X'
            : /Linux/.test(ua) ? 'Linux'
              : 'Other'
  const $device_type = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet'
    : /Mobi|iPhone|iPod|Android/.test(ua) ? 'Mobile'
      : 'Desktop'
  return { $browser, $os, $device_type }
}

/**
 * Cloudflare's published edge addresses (https://www.cloudflare.com/ips/, read 2026-10-09, as migrate pins them).
 * docs.contentrain.io and ai.contentrain.io are proxied by Cloudflare: there the address Netlify sees is Cloudflare's,
 * and the visitor's is `cf-connecting-ip`. Only a Cloudflare hop is trusted to say so.
 */
const CLOUDFLARE = (() => {
  const list = new BlockList()
  for (const net of ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22']) {
    const [address, prefix] = net.split('/')
    list.addSubnet(address, Number(prefix), 'ipv4')
  }
  for (const net of ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']) {
    const [address, prefix] = net.split('/')
    list.addSubnet(address, Number(prefix), 'ipv6')
  }
  return list
})()

const isCloudflare = (ip) => {
  const family = isIP(ip ?? '')
  return family !== 0 && CLOUDFLARE.check(ip, family === 6 ? 'ipv6' : 'ipv4')
}

/** The visitor's address and country: Cloudflare's headers behind a Cloudflare hop, Netlify's own otherwise. */
function visitor(request, context) {
  const hop = request.headers.get('x-nf-client-connection-ip') || context?.ip || ''
  if (isCloudflare(hop)) {
    const ip = request.headers.get('cf-connecting-ip') ?? ''
    const country = request.headers.get('cf-ipcountry') ?? ''
    return { ip: isIP(ip) ? ip : '', country: /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1' ? country : undefined }
  }
  const country = context?.geo?.country?.code
  return { ip: isIP(hop) ? hop : '', country: country && /^[A-Z]{2}$/.test(country) ? country : undefined }
}

/** `v_` + HMAC(HMAC(secret, UTC date), IP + '\n' + UA): one visitor, one id per UTC day on every site. Else random. */
export function visitorId(secret, ip, ua, now = new Date()) {
  if (!secret || !ip) return `p_${crypto.randomUUID()}`
  const salt = createHmac('sha256', secret).update(now.toISOString().slice(0, 10)).digest()
  return `v_${createHmac('sha256', salt).update(`${ip}\n${ua}`).digest('hex').slice(0, 32)}`
}

/** A request this site should not count: not production, a crawler, or an emulated Chrome (no GREASE brand). */
function ownTraffic(request, context, host) {
  const deploy = context?.deploy?.context
  if ((deploy && deploy !== 'production') || /\.netlify\.app$/i.test(host)) return true
  if (CRAWLER.test(request.headers.get('user-agent') ?? '')) return true
  const brands = request.headers.get('sec-ch-ua')
  return brands !== null && !/Brand/.test(brands)
}

/** The body with exactly `path`, `entry`, `referrer` and `utm`, each of its type, or `null`. */
function parseBeacon(raw) {
  let b
  try { b = JSON.parse(raw) }
  catch { return null }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  if (Object.keys(b).toSorted().join(',') !== 'entry,path,referrer,utm') return null
  if (typeof b.entry !== 'boolean') return null
  if (typeof b.path !== 'string' || !/^\/[a-z0-9\-/]{0,120}$/.test(b.path)) return null
  if (b.referrer !== null && (typeof b.referrer !== 'string' || b.referrer.length > 253)) return null
  if (!b.utm || typeof b.utm !== 'object' || Array.isArray(b.utm)) return null
  for (const [key, value] of Object.entries(b.utm)) {
    if (!UTM_KEYS.includes(key) || typeof value !== 'string' || value.length > 200) return null
  }
  return b
}

const answer = (status, headers = {}) => new Response(null, { status, headers })

export default async (request, context) => {
  const key = process.env.POSTHOG_KEY
  const host = process.env.POSTHOG_HOST
  if (!key || !host) return answer(204, { 'x-analytics': 'off' })
  if (request.method !== 'POST') return answer(405)

  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return answer(403)
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return answer(415)
  const raw = await request.text()
  if (Buffer.byteLength(raw) > MAX_BYTES) return answer(413)
  const beacon = parseBeacon(raw)
  if (!beacon) return answer(400)

  const url = new URL(request.url)
  if (ownTraffic(request, context, url.host)) return answer(204)
  const ua = request.headers.get('user-agent') ?? undefined
  const agent = userAgentClass(ua)
  if (!agent) return answer(204)

  const origin = url.origin
  const { ip, country } = visitor(request, context)
  const utm = {}
  for (const k of UTM_KEYS) {
    const value = beacon.utm[k] === undefined ? undefined : utmValue(beacon.utm[k])
    if (value) utm[`utm_${k}`] = value
  }

  try {
    await fetch(`${host.replace(/\/+$/, '')}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: '$pageview',
        distinct_id: visitorId(process.env.ANALYTICS_SALT_SECRET, ip, ua ?? ''),
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        properties: {
          site: SITE,
          $current_url: `${origin}${beacon.path}`,
          $host: url.host,
          $pathname: beacon.path,
          entry: beacon.entry,
          $referring_domain: referrerSource(beacon.referrer),
          ...agent,
          ...(country ? { $geoip_country_code: country } : {}),
          ...utm,
          $process_person_profile: false,
          $geoip_disable: true,
          $lib: LIB,
          // Netlify's deploy context (`production`, `deploy-preview`, …), the same key migrate's events carry. The build-time
          // `CONTEXT` variable does not reach a function at runtime; the request context does.
          environment: context?.deploy?.context || process.env.CONTEXT || null,
        },
      }),
    })
  }
  catch (error) {
    console.warn('[analytics] PostHog send failed:', error instanceof Error ? error.message : 'error')
  }
  return answer(204)
}

export const config = { path: '/api/pageview' }
