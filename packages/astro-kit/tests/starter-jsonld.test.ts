import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const STARTER = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter')
const read = (...path: string[]) => readFile(join(STARTER, ...path), 'utf8')

type Thing = Record<string, unknown>
interface Seo {
  pageTrail: (home: { name: string, url: string }, crumbs: Array<{ name: string, url: string }>) => Array<{ name: string, url: string }>
  localBusinessLd: (site: { name: string, url: string, logo?: string }, business: Record<string, unknown> | undefined) => Thing | undefined
}
// The starter's own builders (a module with no imports), run as the pages run them: from a copy outside the starter,
// whose tsconfig extends a package installed only in a delivered site.
const seo = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'starter-seo-'))
  await copyFile(join(STARTER, 'src', 'lib', 'seo.ts'), join(dir, 'seo.ts'))
  return (await import(pathToFileURL(join(dir, 'seo.ts')).href)) as Seo
}

const SITE = { name: 'Studio Nord', url: 'https://example.com/' }

describe('a page\'s breadcrumb for search', () => {
  it('starts at the home page: a top-level page is Home › Page, a trail that starts there is kept', async () => {
    const { pageTrail } = await seo()
    const home = { name: 'Studio Nord', url: 'https://example.com/' }
    expect(pageTrail(home, [{ name: 'About', url: 'https://example.com/about/' }])).toEqual([home, { name: 'About', url: 'https://example.com/about/' }])
    const trail = [home, { name: 'Team', url: 'https://example.com/about/team/' }]
    expect(pageTrail(home, trail)).toEqual(trail)
  })

  it('is on every page but the home, in the plain and the composed page view', async () => {
    for (const view of ['PageView.astro', 'ComposedPage.astro']) {
      const source = await read('src', 'views', view)
      expect(source, view).toContain('jsonLd={isHome ? [] : [breadcrumbLd(pageTrail({ name: site.title, url: new URL(withBase(\'/\'), origin).href }, ')
    }
  })
})

describe('the site\'s place of business (site.business)', () => {
  it('states only what the fields hold, under the organization', async () => {
    const { localBusinessLd } = await seo()
    expect(localBusinessLd(SITE, { type: 'Restaurant', street: 'Hafenstraße 4', city: 'Hamburg', postal_code: '20457', country: 'DE', telephone: '+49 40 123', opening_hours: ['Mo-Fr 11:00-22:00', ''], serves_cuisine: ['Nordic'] })).toEqual({
      '@type': 'Restaurant',
      '@id': 'https://example.com/#business',
      name: 'Studio Nord',
      url: 'https://example.com/',
      address: { '@type': 'PostalAddress', streetAddress: 'Hafenstraße 4', addressLocality: 'Hamburg', postalCode: '20457', addressCountry: 'DE' },
      telephone: '+49 40 123',
      openingHours: ['Mo-Fr 11:00-22:00'],
      servesCuisine: ['Nordic'],
      parentOrganization: { '@id': 'https://example.com/#organization' },
    })
    const geo = localBusinessLd(SITE, { latitude: 53.54, longitude: 9.98 })
    expect(geo?.['@type']).toBe('LocalBusiness')
    expect(geo?.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 53.54, longitude: 9.98 })
  })

  it('prints nothing without an address, telephone, position or hours: a type or price range alone is no place', async () => {
    const { localBusinessLd } = await seo()
    expect(localBusinessLd(SITE, undefined)).toBeUndefined()
    expect(localBusinessLd(SITE, {})).toBeUndefined()
    expect(localBusinessLd(SITE, { type: 'Store', price_range: '$$', street: ' ', opening_hours: [''] })).toBeUndefined()
    expect(localBusinessLd(SITE, { latitude: 53.54 })).toBeUndefined()
  })

  it('goes on the home only, beside the website and the organization, and the model and content config carry it', async () => {
    const layout = await read('src', 'layouts', 'BaseLayout.astro')
    expect(layout).toContain('jsonLd={isHome ? [websiteLd(identity), organizationLd(identity), ...[localBusinessLd(identity, (site as { business?: BusinessInput }).business)].filter(thing => thing !== undefined), ...jsonLd] : jsonLd}')
    const model = JSON.parse(await read('.contentrain', 'models', 'site.json'))
    expect(Object.keys(model.fields.business.fields).toSorted()).toEqual(['city', 'country', 'latitude', 'longitude', 'opening_hours', 'postal_code', 'price_range', 'region', 'serves_cuisine', 'street', 'telephone', 'type'])
    expect(await read('src', 'content.config.ts')).toContain('      business: z.object({')
  })
})
