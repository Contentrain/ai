// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"handleDisabledFileLoadingAsSuccess":true}}
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The starter's analytics gate (`Analytics.astro`), run as the page runs it: no tag before an explicit yes, the tag
 * after one, and Google's Consent Mode v2 starting denied with only measurement granted (ad signals stay denied).
 */

const STARTER = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter')

/** The inline script's body; `define:vars` wraps it in a function of `provider`, `id` and `host`, as Astro does. */
async function gate(): Promise<(provider: string, id: string, host?: string) => void> {
  const source = await readFile(join(STARTER, 'src', 'components', 'Analytics.astro'), 'utf8')
  const body = /<script is:inline define:vars=\{\{ provider, id, host \}\}>([\s\S]*?)<\/script>/.exec(source)?.[1]
  if (!body) throw new Error('Analytics.astro: the inline gate script was not found')
  return new Function('provider', 'id', 'host', body) as (provider: string, id: string, host?: string) => void
}

const tags = () => [...document.head.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))
/** The data layer as pushed: `gtag()` pushes its `arguments`, GTM's start is a plain `{ event: 'gtm.js' }`. */
const layer = () => (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []
const consentCalls = () => layer().filter((entry): entry is ArrayLike<unknown> => (entry as ArrayLike<unknown>)[0] === 'consent').map(entry => Array.from(entry))
const answer = (granted: boolean) => {
  document.documentElement.dataset.consent = granted ? 'granted' : 'denied'
  document.dispatchEvent(new CustomEvent('kit:consent', { detail: { granted } }))
}

// Each run of the gate listens on document; a test's listeners go with it, so one test's provider never answers another's.
let listeners: Array<[string, EventListenerOrEventListenerObject]> = []
beforeEach(() => {
  const add = document.addEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject) => {
    listeners.push([type, listener])
    add(type, listener)
  })
  document.head.innerHTML = ''
  delete document.documentElement.dataset.consent
  delete (window as unknown as { dataLayer?: unknown }).dataLayer
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  for (const [type, listener] of listeners) document.removeEventListener(type, listener)
  listeners = []
  localStorage.clear()
})

describe('the starter\'s analytics gate', () => {
  it('loads no tag before the visitor says yes, and GTM after a yes', async () => {
    document.documentElement.dataset.consent = 'denied'
    ;(await gate())('gtm', 'GTM-ABC1234')
    expect(tags()).toEqual([])
    answer(true)
    expect(tags()).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234'])
  })

  it('starts every Consent Mode v2 signal denied, then grants measurement only, before the tag reads it', async () => {
    ;(await gate())('gtm', 'GTM-ABC1234')
    expect(consentCalls()).toEqual([['consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' }]])
    answer(true)
    expect(consentCalls()).toEqual([
      ['consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' }],
      ['consent', 'update', { analytics_storage: 'granted' }],
    ])
    // The update is in the layer before GTM's start event, so the container reads the granted state on load.
    const entries = layer()
    expect(entries.findIndex(entry => (entry as ArrayLike<unknown>)[1] === 'update')).toBeLessThan(entries.findIndex(entry => (entry as { event?: string }).event === 'gtm.js'))
  })

  it('loads no tag on a no, and a withdrawn yes denies measurement again', async () => {
    ;(await gate())('ga4', 'G-TEST12345')
    answer(false)
    expect(tags()).toEqual([])
    answer(true)
    expect(tags()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST12345'])
    answer(false)
    expect(consentCalls().at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }])
  })

  it('a yes stored on an earlier visit loads the tag on the next page', async () => {
    localStorage.setItem('kit-consent', 'granted')
    ;(await gate())('plausible', 'example.com')
    expect(tags()).toEqual(['https://plausible.io/js/script.js'])
  })
})
