/**
 * Page views, without an analytics script or cookies (the same beacon as contentrain.io's).
 *
 * Each page is reported to this site's own function (`netlify/functions/pageview.mjs`), which turns it into a route and
 * classes before anything reaches PostHog. What the page sends: the path, whether it is the first page of this load
 * (`entry`: visits are counted as entries), the referring site's host on that first page only, and the campaign tags in
 * the address. The tags and ad click ids are then taken out of the address, so a copied link does not carry them on.
 * With analytics off (no key), the first answer says so and the page stops sending.
 */
import type { Router } from 'vitepress'

const BEACON_PATH = '/api/pageview'
const UTM_KEYS = ['source', 'medium', 'campaign', 'content'] as const
const TRACKING_PARAMS = /^(utm_[a-z_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|ttclid|twclid|li_fat_id|mc_eid|yclid|_hsenc|_hsmi)$/i

/** The referring site's host; none for this site itself (a full reload) or no referrer. */
function referrerHost(): string | null {
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : ''
    return host && host !== window.location.hostname ? host : null
  }
  catch { return null }
}

/** Reports every page the router lands on, the first one (VitePress's initial `go()`) included. */
export function reportPageviews(router: Router): void {
  if (import.meta.env.SSR || import.meta.env.DEV) return
  let off = false
  let first = true
  let last = ''

  function report(href: string) {
    const url = new URL(href, window.location.origin)
    const utm: Record<string, string> = {}
    for (const key of UTM_KEYS) {
      const value = url.searchParams.get(`utm_${key}`)
      if (value) utm[key] = value.slice(0, 200)
    }
    const kept = new URLSearchParams([...url.searchParams].filter(([key]) => !TRACKING_PARAMS.test(key)))
    if (kept.toString() !== url.searchParams.toString()) {
      const search = kept.toString()
      history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`)
    }

    const path = url.pathname
    if (path === last) return
    last = path
    const entry = first
    const referrer = entry ? referrerHost() : null
    first = false
    if (off) return
    void fetch(BEACON_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, entry, referrer, utm }),
      credentials: 'omit',
      keepalive: true,
    })
      .then((response) => { if (response.headers.get('x-analytics') === 'off') off = true })
      .catch(() => {})
  }

  const previous = router.onAfterRouteChange
  router.onAfterRouteChange = async (href) => {
    await previous?.(href)
    report(href)
  }
}
