import { describe, expect, it } from 'vitest'
import { createDecider } from './decide.js'
import { createJevProvider, requestShapeHash } from './jev.js'
import { fieldType, fieldTypeRule, regionName, regionRule, shapeFieldType, shapeRegion, shapeUnmapped, unmappedElement, unmappedRule } from './kinds/facts.js'
import { MemoryAuditLog } from './audit.js'
import { ENV, scriptedFetch } from './test-support.js'

const field = (over: Partial<Parameters<typeof shapeFieldType>[0]> = {}) => ({ tag: 'p', prop: 'text' as const, instances: 12, distinct: 12, maxLength: 150, samples: ['Mail ops@site.test or see https://site.test/a'], options: ['string', 'text'], ...over })

describe('field_type', () => {
  it('scrubs samples again and keeps only allowed options, in a fixed order', () => {
    const shaped = shapeFieldType(field({ options: ['text', 'string', 'bogus'] }))
    expect(shaped.samples).toEqual(['Mail <email> or see <url>'])
    expect(shaped.options).toEqual(['string', 'text'])
  })

  it('settles the clear lengths and counts, and is tentative in between', () => {
    expect(fieldTypeRule(field({ maxLength: 60 }))).toEqual({ choice: 'string', confidence: 1, final: true })
    expect(fieldTypeRule(field({ maxLength: 400 }))).toEqual({ choice: 'text', confidence: 1, final: true })
    expect(fieldTypeRule(field({ maxLength: 150 }))).toEqual({ choice: 'text', confidence: 0.5, final: false })
    expect(fieldTypeRule(field({ options: ['select', 'string'], instances: 10, distinct: 2 }))).toEqual({ choice: 'select', confidence: 1, final: true })
    expect(fieldTypeRule(field({ options: ['relation', 'url'], prop: 'href' }))).toEqual({ choice: 'relation', confidence: 0.6, final: false })
  })

  it('asks Jev one request per option set, naming the valid types', async () => {
    const { fetch, calls } = scriptedFetch(line => ({ type: line.startsWith('<a>') ? { type: 'choice', choice: 'relation', confidence: 0.9 } : { type: 'choice', choice: 'text', confidence: 0.9 } }))
    const decider = createDecider({ jev: createJevProvider({ env: ENV, fetch }) })
    const out = await decider.decideMany('field_type', [field(), field({ tag: 'a', options: ['relation', 'url'], prop: 'href', samples: ['https://site.test/p/'] })])
    expect(calls).toHaveLength(2)
    expect(JSON.stringify(calls[0])).toContain('Valid types for every item in this request: string, text.')
    expect(JSON.stringify(calls)).not.toContain('ops@site.test')
    expect(out[0]).toMatchObject({ choice: 'text', source: 'jev' })
    expect(out[1]).toMatchObject({ choice: 'relation', source: 'jev' })
  })

  it('without a token, the rule answers and the tentative ones are unreviewed', async () => {
    const decider = createDecider({ jev: createJevProvider({ env: {} }), audit: new MemoryAuditLog() })
    expect(await decider.decide('field_type', field({ maxLength: 60 }))).toMatchObject({ choice: 'string', source: 'rule' })
    expect(await decider.decide('field_type', field())).toMatchObject({ choice: 'text', source: 'rule', unreviewed: true })
  })
})

describe('region_name', () => {
  it('rounds the box and scrubs the text', () => {
    expect(shapeRegion({ tag: 'section', box: [0, 812, 1277, 433], text: 'Call +90 555 or mail a@b.co' })).toMatchObject({ top: 800, width: 1280, height: 450, text: 'Call +90 555 or mail <email>' })
  })

  it('reads the clear hints and falls back to content', () => {
    expect(regionRule({ tag: 'div', classes: ['wp-block-details-faq'] })?.choice).toBe('faq')
    expect(regionRule({ tag: 'div', forms: 1, text: 'Subscribe to our newsletter' })?.choice).toBe('newsletter')
    expect(regionRule({ tag: 'ul', children: ['core/post', 'core/post', 'core/post'] })?.choice).toBe('card-grid')
    expect(regionRule({ tag: 'div', box: [0, 80, 1280, 600], headings: 1 })?.choice).toBe('hero')
    expect(regionRule({ tag: 'div', box: [0, 2000, 1280, 200] })).toEqual({ choice: 'content', confidence: 0.3, final: false })
  })
})

describe('unmapped_element', () => {
  it('names the kit component from the element name when it says so', () => {
    expect(unmappedRule({ name: 'uagb/info-box', builder: 'gutenberg', count: 94, pages: 12 })).toEqual({ choice: 'card-grid', confidence: 0.9, final: true })
    expect(unmappedRule({ name: 'elementor/image-carousel', builder: 'elementor', count: 3, pages: 2 })?.choice).toBe('slider')
    expect(unmappedRule({ name: 'divi/et_pb_toggle', builder: 'divi', count: 8, pages: 1 })?.choice).toBe('faq')
    expect(unmappedRule({ name: 'uagb/advanced-heading', builder: 'gutenberg', count: 91, pages: 12 })?.choice).toBe('prose')
    expect(unmappedRule({ name: 'acme/widget-x', builder: 'gutenberg', count: 1, pages: 1 })).toEqual({ choice: 'site-specific', confidence: 0.3, final: false })
    expect(shapeUnmapped({ name: 'uagb/info-box', builder: 'Gutenberg', count: 1, pages: 1, attrKeys: ['Title Tag'] })).toEqual({ name: 'uagb-info-box', builder: 'gutenberg', count: 1, pages: 1, attr_keys: ['title-tag'] })
  })
})

describe('request shapes', () => {
  it('are pinned per kind (a changed prompt changes the cache key)', () => {
    const shapes = [fieldType, regionName, unmappedElement].map(k => requestShapeHash(k))
    expect(new Set(shapes).size).toBe(3)
    for (const s of shapes) expect(s).toMatch(/^[0-9a-f]{16,64}$/)
  })
})
