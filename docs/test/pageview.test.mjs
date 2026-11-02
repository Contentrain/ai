// The page-view function against the shared analytics contract: what is counted, what is dropped, and the daily id.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import pageview, { visitorId } from '../../netlify/functions/pageview.mjs'

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'
const BRANDS = '"Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"'
const PRODUCTION = { deploy: { context: 'production' }, geo: { country: { code: 'DE' } } }

let sent
const realFetch = globalThis.fetch
beforeEach(() => {
  sent = []
  process.env.POSTHOG_KEY = 'phc_test'
  process.env.POSTHOG_HOST = 'https://eu.i.posthog.com'
  process.env.ANALYTICS_SALT_SECRET = 'test-secret'
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response(null, { status: 200 }) }
})
afterEach(() => { globalThis.fetch = realFetch })

function beacon({ host = 'ai.contentrain.io', ua = CHROME, brands = BRANDS, ip = '203.0.113.7', headers = {} } = {}) {
  return new Request(`https://${host}/api/pageview`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      'user-agent': ua,
      'x-nf-client-connection-ip': ip,
      ...(brands ? { 'sec-ch-ua': brands } : {}),
      ...headers,
    },
    body: JSON.stringify({ path: '/pricing', entry: true, referrer: 'www.google.com', utm: { source: 'linkedin' } }),
  })
}

test('a production page view is sent with the contract properties and without the IP or user agent', async () => {
  assert.equal((await pageview(beacon(), PRODUCTION)).status, 204)
  assert.equal(sent.length, 1)
  const [event] = sent
  assert.match(event.distinct_id, /^v_[0-9a-f]{32}$/)
  assert.deepEqual(
    { site: event.properties.site, path: event.properties.$pathname, entry: event.properties.entry, ref: event.properties.$referring_domain, utm: event.properties.utm_source, country: event.properties.$geoip_country_code },
    { site: 'ai', path: '/pricing', entry: true, ref: 'google.com', utm: 'linkedin', country: 'DE' },
  )
  const body = JSON.stringify(event)
  assert.ok(!body.includes('203.0.113.7') && !body.includes('Macintosh'))
})

test('own traffic is dropped: a preview deploy, a netlify.app host, a crawler, an emulated Chrome', async () => {
  await pageview(beacon(), { ...PRODUCTION, deploy: { context: 'deploy-preview' } })
  await pageview(beacon({ host: 'contentrain-ai.netlify.app' }), PRODUCTION)
  await pageview(beacon({ ua: `${CHROME} Chrome-Lighthouse` }), PRODUCTION)
  // Lighthouse 13's own beacon: a plain phone UA, and brands without the GREASE entry real Chrome always adds.
  await pageview(beacon({ ua: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36', brands: '"Chromium";v="156", "Google Chrome";v="156"' }), PRODUCTION)
  assert.equal(sent.length, 0)
  // Safari and Firefox send no brands at all, and are counted.
  await pageview(beacon({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', brands: null }), PRODUCTION)
  assert.equal(sent.length, 1)
})

test('the visitor id is one per visitor per UTC day, and random without the secret', async () => {
  const day = new Date('2026-11-02T08:00:00Z')
  assert.equal(visitorId('test-secret', '203.0.113.7', CHROME, day), visitorId('test-secret', '203.0.113.7', CHROME, new Date('2026-11-02T23:59:59Z')))
  assert.notEqual(visitorId('test-secret', '203.0.113.7', CHROME, day), visitorId('test-secret', '203.0.113.7', CHROME, new Date('2026-11-03T00:00:00Z')))
  assert.notEqual(visitorId('test-secret', '203.0.113.7', CHROME, day), visitorId('other-secret', '203.0.113.7', CHROME, day))
  // The contract's test vector, shared with migrate.
  assert.equal(visitorId('s', '1.2.3.4', 'ua', day), 'v_e12e08f2b6b391f9903734087e0b30b7')

  delete process.env.ANALYTICS_SALT_SECRET
  assert.equal((await pageview(beacon(), PRODUCTION)).status, 204)
  assert.match(sent[0].distinct_id, /^p_[0-9a-f-]{36}$/)
})

test('behind Cloudflare the visitor is cf-connecting-ip; the same header from anyone else is ignored', async () => {
  await pageview(beacon({ host: 'docs.contentrain.io', ip: '162.158.1.1', headers: { 'cf-connecting-ip': '198.51.100.9', 'cf-ipcountry': 'TR' } }), PRODUCTION)
  await pageview(beacon({ ip: '198.51.100.9', headers: { 'cf-connecting-ip': '192.0.2.1', 'cf-ipcountry': 'US' } }), PRODUCTION)
  const now = new Date()
  assert.equal(sent[0].distinct_id, visitorId('test-secret', '198.51.100.9', CHROME, now))
  assert.equal(sent[0].properties.$geoip_country_code, 'TR')
  assert.equal(sent[1].distinct_id, visitorId('test-secret', '198.51.100.9', CHROME, now))
  assert.equal(sent[1].properties.$geoip_country_code, 'DE')
})
