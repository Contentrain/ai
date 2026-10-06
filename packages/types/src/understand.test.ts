import { describe, expect, it } from 'vitest'
import {
  ARCHETYPES,
  ITEM_ARCHETYPES,
  REGION_GROUP_SLOT_DEFS,
  REGION_ITEM_SLOT_DEFS,
  REGION_SLOT_DEFS,
  UNDERSTAND_ISSUE_CODES,
  forEachSlot,
  needsFallback,
  regionId,
  validateBands,
  validateRegionSpecs,
  type Band,
  type RegionSlotDef,
  type RegionSpec,
  type UnderstandIssue,
} from './understand.js'

/** A home page in four bands: header, hero over a background image, a card grid, footer. */
const bands = (): Band[] => [
  { id: 'home:00', template: 'home', order: 0, landmark: 'header', boxes: { 1280: { x: 0, y: 0, w: 1280, h: 112 }, 390: { x: 0, y: 0, w: 390, h: 64 } }, nodes: { first: 3, last: 43 }, style: { tone: 'dark' } },
  { id: 'home:01', template: 'home', order: 1, boxes: { 1280: { x: 0, y: 0, w: 1280, h: 675 } }, nodes: { first: 53, last: 68 }, style: { bg: { image: 'https://example.com/hero.webp', overlay: 'rgba(0, 0, 0, 0.5)' }, minHeight: 675 }, hints: { widgets: ['heading', 'button'] } },
  { id: 'home:02', template: 'home', order: 2, boxes: { 1280: { x: 0, y: 675, w: 1280, h: 420 } }, nodes: { first: 69, last: 117 }, style: { containerPx: 1140, columns: { 1280: 3, 390: 1 }, gap: 24 } },
  { id: 'home:03', template: 'home', order: 3, landmark: 'footer', boxes: { 1280: { x: 0, y: 1095, w: 1280, h: 300 } }, nodes: { first: 120, last: 180 }, style: {} },
]

const header = (): RegionSpec => ({
  band: 'home:00', part: 0, archetype: 'header', confidence: 0.95, ungrounded: ['nav'],
  slots: { logo: { node: 16 }, nav: [{ node: 23 }, { node: 25 }], actions: [{ node: 43 }] },
})
const hero = (): RegionSpec => ({
  band: 'home:01', part: 0, archetype: 'hero', confidence: 0.95, ungrounded: [],
  slots: { heading: { node: 60 }, lead: { node: 64 }, actions: [{ node: 66 }], media: { node: 53, background: true } },
})
const cards = (): RegionSpec => ({
  band: 'home:02', part: 0, archetype: 'card-grid', confidence: 0.8, ungrounded: ['items.2.icon'], dynamic: ['hover'],
  slots: {
    heading: { node: 70 },
    items: [
      { media: { node: 80 }, title: { node: 84 }, link: { node: 84 } },
      { media: { node: 90 }, title: { node: 94 }, points: [{ node: 95 }, { node: 96 }] },
    ],
  },
})
const footer = (): RegionSpec => ({
  band: 'home:03', part: 0, archetype: 'footer', confidence: 0.9, ungrounded: [],
  slots: { groups: [{ title: { node: 125 }, links: [{ node: 127 }, { node: 129 }] }], copyright: { node: 178 } },
})
const specs = (): RegionSpec[] => [header(), hero(), cards(), footer()]

const codes = (issues: UnderstandIssue[]): string[] => issues.map(issue => issue.code)
const table = (defs: Record<string, RegionSlotDef>): string[] => Object.entries(defs).map(([name, def]) => `${name}:${def.kind}${def.many ? '[]' : ''}`)
/** The model's raw answer is untyped: the validator must hold against shapes the types forbid. */
const untyped = (spec: RegionSpec, patch: Record<string, unknown>): RegionSpec => ({ ...spec, ...patch }) as RegionSpec

describe('validateBands', () => {
  it('accepts bands whose node ranges do not overlap', () => {
    expect(validateBands(bands())).toEqual([])
  })

  it('does not bind the rendered order to document order: a footer that comes first in the markup is still last', () => {
    const [a, b, c, d] = bands() as [Band, Band, Band, Band]
    expect(validateBands([a, b, c, { ...d, nodes: { first: 1, last: 2 } }])).toEqual([])
    expect(validateBands([a, b, { ...c, order: 1 }]).map(issue => issue.message)).toEqual([`Bands ${b.id} and ${c.id} share an order.`])
  })

  it('rejects a duplicate id, an id with "#", a missing reference box and a reversed range', () => {
    const [a, b, c, d] = bands() as [Band, Band, Band, Band]
    const issues = validateBands([a, { ...b, id: a.id }, { ...c, id: 'home#2', boxes: { 390: { x: 0, y: 0, w: 390, h: 10 } } }, { ...d, nodes: { first: 9, last: 2 } }])
    expect(codes(issues)).toEqual(['bad_band', 'bad_band', 'bad_band', 'bad_band'])
    expect(issues.map(issue => issue.band)).toEqual([a.id, 'home#2', 'home#2', d.id])
  })

  it('rejects ranges that overlap inside a template, but not across templates', () => {
    const [a, b] = bands() as [Band, Band, Band, Band]
    const overlapping = { ...b, nodes: { first: 40, last: 68 } }
    expect(validateBands([a, overlapping]).map(issue => issue.message)).toEqual([`The node range overlaps band ${a.id}'s.`])
    expect(validateBands([a, { ...overlapping, template: 'post' }])).toEqual([])
  })

  it('takes settled states from the closed list only', () => {
    const [a, b] = bands() as [Band, Band, Band, Band]
    expect(validateBands([a, { ...b, settled: ['lazy-bg', 'slide0'] }])).toEqual([])
    const issues = validateBands([a, { ...b, settled: ['lazy-bg', 'parallax-off'] } as unknown as Band])
    expect(issues.map(issue => issue.message)).toEqual(['settled is a list of: slide0, counter-final, lazy-bg, preloader-off, panels-open.'])
  })

  it('rejects a box keyed by a width the engine does not render', () => {
    const [a] = bands() as [Band]
    expect(codes(validateBands([{ ...a, boxes: { ...a.boxes, 1024: { x: 0, y: 0, w: 1024, h: 80 } } as Band['boxes'] }]))).toEqual(['bad_band'])
  })
})

describe('validateRegionSpecs', () => {
  it('accepts grounded regions: every ref lies in its band', () => {
    expect(validateRegionSpecs(specs(), bands())).toEqual([])
  })

  it('reports a ref outside the band with its slot path', () => {
    const spec = hero()
    spec.slots.actions = [{ node: 66 }, { node: 70 }]
    expect(validateRegionSpecs([spec], bands())).toEqual([
      { code: 'node_outside_band', band: 'home:01', part: 0, slot: 'actions.1', message: 'Node 70 is outside the band\'s nodes (53–68).' },
    ])
  })

  it('asks the outline whether a node holds the slot\'s kind, and reports what does not', () => {
    const asked: string[] = []
    const issues = validateRegionSpecs([hero()], bands(), {
      resolves: (ref, kind, band) => {
        asked.push(`${band.id} ${kind} ${ref.node}${ref.background ? ' bg' : ''}`)
        return ref.node !== 64
      },
    })
    expect(asked).toEqual(['home:01 text 60', 'home:01 text 64', 'home:01 image 53 bg', 'home:01 link 66'])
    expect(issues).toEqual([{ code: 'slot_unresolved', band: 'home:01', part: 0, slot: 'lead', message: 'Node 64 holds no text.' }])
  })

  it('allows a background only on an image slot', () => {
    const spec = hero()
    spec.slots.heading = { node: 60, background: true }
    expect(codes(validateRegionSpecs([spec], bands()))).toEqual(['background_not_image'])
  })

  it('rejects slots outside the vocabulary and malformed refs instead of dropping them', () => {
    const spec = untyped(cards(), {
      slots: { heading: 'Our services', subheading: { node: 71 }, body: { node: 72 }, items: [{ title: { node: 84 }, quote: { node: 85 } }, {}, { title: { node: '84' } }] },
    })
    expect(validateRegionSpecs([spec], bands()).map(issue => `${issue.code} ${issue.slot}`)).toEqual([
      'bad_slot heading',
      'bad_slot body',
      'unknown_slot subheading',
      'unknown_slot items.0.quote',
      'bad_slot items.1',
      'bad_slot items.2.title',
    ])
  })

  it('rejects a ref that carries the model\'s own text', () => {
    const spec = untyped(hero(), { slots: { heading: { node: 60, text: 'Fast repairs' } } })
    expect(codes(validateRegionSpecs([spec], bands()))).toEqual(['bad_slot'])
  })

  it('rejects an unknown band, an unknown archetype, a confidence outside 0..1 and a repeated part', () => {
    const issues = validateRegionSpecs([
      { ...hero(), band: 'home:09' },
      untyped(hero(), { archetype: 'blog-list', confidence: 1.2 }),
      hero(),
    ], bands())
    expect(codes(issues)).toEqual(['unknown_band', 'unknown_archetype', 'bad_confidence', 'duplicate_region'])
  })

  it('needs items where the archetype is its items, and a slot everywhere but the slotless archetypes', () => {
    const noItems: RegionSpec = { ...cards(), slots: { heading: { node: 70 } } }
    const empty: RegionSpec = { ...hero(), slots: {} }
    const postList: RegionSpec = { ...cards(), part: 1, archetype: 'post-list', slots: {} }
    const other: RegionSpec = { ...footer(), archetype: 'other', confidence: 0.2, slots: {} }
    expect(validateRegionSpecs([noItems, empty, postList, other], bands()).map(issue => `${issue.code} ${issue.band}`)).toEqual([
      'missing_items home:02',
      'empty_region home:01',
    ])
  })

  it('checks ungrounded paths and dynamic states against the vocabulary', () => {
    const spec = untyped(cards(), { ungrounded: ['items.icon', 'groups.0.links', 'items.rating', 'the star icons'], dynamic: ['slider', 'parallax'] })
    expect(validateRegionSpecs([spec], bands()).map(issue => issue.message)).toEqual([
      '"items.rating" is not a slot path.',
      '"the star icons" is not a slot path.',
      'dynamic is a list of: slider, tabs, accordion, counter, hover, animation, video, embed.',
    ])
  })

  it('holds sameAs to one archetype and one level', () => {
    const second: RegionSpec = { ...cards(), part: 1, sameAs: 'home:02#0' }
    expect(validateRegionSpecs([cards(), second], bands())).toEqual([])
    const third: RegionSpec = { ...cards(), part: 2, sameAs: 'home:02#1' }
    const cross: RegionSpec = { ...hero(), sameAs: 'home:02#0' }
    const self: RegionSpec = { ...footer(), sameAs: 'home:03#0' }
    expect(validateRegionSpecs([cards(), second, third, cross, self], bands()).map(issue => `${issue.code} ${issue.band}#${issue.part}`)).toEqual([
      'bad_same_as home:02#2',
      'bad_same_as home:01#0',
      'bad_same_as home:03#0',
    ])
  })

  it('lets a band carry on a region of an earlier band of the same template only', () => {
    const intro: RegionSpec = { band: 'home:02', part: 0, archetype: 'text', confidence: 0.9, ungrounded: [], slots: { heading: { node: 70 } } }
    const carried: RegionSpec = { ...footer(), continues: 'home:02#0' }
    expect(validateRegionSpecs([intro, carried], bands())).toEqual([])
    expect(validateRegionSpecs([{ ...intro, archetype: 'footer' }, carried], bands())).toEqual([])
    expect(validateRegionSpecs([cards(), carried], bands()).map(issue => issue.message)).toEqual(['continues joins regions of one archetype, or carries on a text introduction.'])
    const forward: RegionSpec = { ...hero(), continues: 'home:02#0' }
    const missing: RegionSpec = { ...footer(), continues: 'home:07#0' }
    expect(codes(validateRegionSpecs([forward, cards(), missing], bands()))).toEqual(['bad_continues', 'bad_continues'])
    const elsewhere = bands()
    elsewhere[3]!.template = 'post'
    expect(codes(validateRegionSpecs([intro, carried], elsewhere))).toEqual(['bad_continues'])
  })

  it('only reports codes it declares', () => {
    const everything = validateRegionSpecs([untyped(hero(), { archetype: 'x', confidence: -1, slots: null, ungrounded: null, dynamic: 'slider', sameAs: 'nope', continues: 'nope' })], bands())
    expect(everything.length).toBeGreaterThan(5)
    for (const issue of everything) expect(UNDERSTAND_ISSUE_CODES).toContain(issue.code)
  })
})

describe('forEachSlot', () => {
  it('visits refs with kind and path in the vocabulary\'s order, whatever the key order of the input', () => {
    const visit = (spec: RegionSpec): string[] => {
      const seen: string[] = []
      forEachSlot(spec, (ref, kind, path) => seen.push(`${path}=${kind}:${ref.node}`))
      return seen
    }
    const expected = ['heading=text:70', 'items.0.media=image:80', 'items.0.title=text:84', 'items.0.link=link:84', 'items.1.media=image:90', 'items.1.title=text:94', 'items.1.points.0=text:95', 'items.1.points.1=text:96']
    expect(visit(cards())).toEqual(expected)
    const shuffled = cards()
    shuffled.slots = { items: shuffled.slots.items!.map(item => Object.fromEntries(Object.entries(item).toReversed())), heading: shuffled.slots.heading }
    expect(visit(shuffled)).toEqual(expected)
  })

  it('skips malformed slots', () => {
    const seen: number[] = []
    forEachSlot(untyped(hero(), { slots: { heading: 'text', lead: { node: 64 }, items: 'none' } }), ref => seen.push(ref.node))
    expect(seen).toEqual([64])
  })
})

describe('regionId and needsFallback', () => {
  it('names a region by band and part', () => {
    expect(regionId({ band: 'home:02', part: 1 })).toBe('home:02#1')
  })

  it('sends "other", low and unreadable confidence to the fallback section', () => {
    expect(needsFallback({ archetype: 'hero', confidence: 0.5 })).toBe(false)
    expect(needsFallback({ archetype: 'hero', confidence: 0.49 })).toBe(true)
    expect(needsFallback({ archetype: 'other', confidence: 0.99 })).toBe(true)
    expect(needsFallback({ archetype: 'hero', confidence: Number.NaN })).toBe(true)
  })
})

describe('vocabulary', () => {
  it('keeps the archetypes the kit and the prompt are written against', () => {
    expect(ARCHETYPES).toEqual([
      'header', 'footer', 'hero', 'card-grid', 'feature-split', 'logo-strip', 'stats', 'testimonial', 'faq', 'cta-band',
      'pricing', 'team', 'gallery', 'slider', 'post-list', 'contact-form', 'timeline', 'text', 'other',
    ])
    for (const archetype of ITEM_ARCHETYPES) expect(ARCHETYPES).toContain(archetype)
  })

  it('keeps the slot tables: a rename here is a breaking change for the prompt, the kit and stored responses', () => {
    expect(table(REGION_SLOT_DEFS)).toEqual(['eyebrow:text', 'heading:text', 'lead:text', 'body:text[]', 'media:image', 'actions:link[]', 'logo:image', 'nav:link[]', 'utility:link[]', 'social:link[]', 'copyright:text'])
    expect(table(REGION_ITEM_SLOT_DEFS)).toEqual(['media:image', 'icon:icon', 'title:text', 'text:text', 'meta:text', 'value:text', 'link:link', 'points:text[]', 'links:link[]'])
    expect(table(REGION_GROUP_SLOT_DEFS)).toEqual(['title:text', 'text:text[]', 'links:link[]'])
  })
})
