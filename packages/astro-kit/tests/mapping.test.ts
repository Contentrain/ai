import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { attrsOf, claimMatches, classifySection, KIT_BUILDERS, matchSection, rulesFor, sectionRuleId, sectionValueSlots, unmappedSources, validateMapping, type KitCatalog, type MappingTable, type SectionLeaf, type SectionRule } from '../src/index'

const ROOT = join(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(join(ROOT, 'catalog.json'), 'utf8')) as KitCatalog
const video = (attrs: Record<string, unknown>) => ({ name: 'elementor/video', attrs })
const tables = Object.fromEntries(await Promise.all(KIT_BUILDERS.map(async b => [b, JSON.parse(await readFile(join(ROOT, 'mapping', `${b}.json`), 'utf8')) as MappingTable] as const)))

/** The same leaves as facts that set no flags. */
const unflagged = (leaves: SectionLeaf[]) => leaves.map(({ numeric: _n, ordinal: _o, portrait: _p, short: _s, ...rest }) => rest)

describe('mapping tables', () => {
  for (const builder of KIT_BUILDERS) {
    describe(builder, () => {
      it('is sound against the catalog: components, props, variants, array items, required props, values', () => {
        expect(validateMapping(tables[builder]!, catalog)).toEqual([])
      })

      it('has a rule for every element the catalog says a component stands in for', () => {
        expect(unmappedSources(tables[builder]!, catalog)).toEqual([])
      })
    })
  }

  it('centres a cover\'s text unless WordPress positions it on the left', () => {
    expect(rulesFor(tables.gutenberg!, 'core/cover')[0]).toMatchObject({ component: 'hero', variant: { layout: 'cover', align: 'class:is-position-*-left=start|center', width: 'class:alignfull=full|content' } })
  })

  it('maps WordPress\'s details block to the plain FAQ, the browser\'s own disclosure', () => {
    expect(rulesFor(tables.gutenberg!, 'core/details')[0]).toMatchObject({ component: 'faq', variant: { style: 'plain' } })
  })

  it('catches what a broken rule gets wrong', () => {
    const broken: MappingTable = {
      format: 'astro-kit-mapping@1', builder: 'elementor', version: '1', fallback: 'prose',
      rules: [
        { match: 'elementor/icon-box', component: 'card-grid', variant: { columns: '5' }, into: 'items', item: { heading: 'dom:h3', title: 'innerHTML' } },
        { match: 'core/cover', component: 'no-such-component' },
        { match: 'elementor/nav-menu', component: 'nav', props: { items: 'menu:sidebar', label: 'const:Our great studio' } },
      ],
      defaults: { 'core/video': { autoplay: false } },
    }
    expect(validateMapping(broken, catalog)).toEqual([
      'defaults core/video: not a elementor element',
      'elementor elementor/icon-box: card-grid.columns has no option 5',
      'elementor elementor/icon-box: card-grid.items[] has no field heading',
      'elementor elementor/icon-box: items[].title = innerHTML is not a mapping value',
      'elementor elementor/icon-box: into items needs each, group or bind to say what repeats',
      'elementor core/cover: not a elementor element',
      'elementor core/cover: component no-such-component is not in the catalog',
      'elementor elementor/nav-menu: items = menu:sidebar is not a mapping value',
      'elementor elementor/nav-menu: label = const:Our great studio is not a mapping value',
    ])
  })

  it('reads a class as a choice between options, for a value or a variant', () => {
    const table: MappingTable = {
      format: 'astro-kit-mapping@1', builder: 'gutenberg', version: '1', fallback: 'prose',
      rules: [
        { match: 'core/cover', component: 'hero', variant: { layout: 'class:is-style-wide=cover|split' }, props: { heading: 'dom:h2' }, into: 'actions', each: 'a', item: { label: 'dom:', href: 'dom:@href', style: 'class:is-style-outline=ghost|primary' } },
        { match: 'core/media-text', component: 'hero', variant: { layout: 'class:has-media-*=cover|' }, props: { heading: 'dom:h2' } },
        { match: 'core/group', component: 'hero', variant: { layout: 'class:is-style-x=wide|split' }, props: { heading: 'dom:h2' } },
      ],
    }
    expect(validateMapping(table, catalog)).toEqual(['gutenberg core/group: hero.layout has no option wide'])
  })

  it('finds the most specific rule first', () => {
    const rules = rulesFor(tables.gutenberg!, 'core/template-part')
    expect(rules.map(r => r.match)).toEqual(['core/template-part:header', 'core/template-part:footer'])
    expect(rulesFor(tables.gutenberg!, 'core/query').map(r => r.component)).toEqual(['post-card'])
  })

  it('lets the outermost match own its subtree', () => {
    const tree = [
      { name: 'core/template-part', attrs: { area: 'header' }, children: [{ name: 'core/site-logo' }, { name: 'core/site-title' }, { name: 'core/navigation' }] },
      { name: 'core/group', children: [{ name: 'core/cover', children: [{ name: 'core/heading' }] }, { name: 'core/site-title' }] },
      { name: 'core/template-part', attrs: { area: 'footer' }, children: [{ name: 'core/social-links' }] },
    ]
    expect(claimMatches(tree, tables.gutenberg!).map(m => `${m.path} ${m.rule.match} -> ${m.rule.component}`)).toEqual([
      '0.0 core/template-part:header -> header',
      '0.1.0 core/cover -> hero',
      '0.1.1 core/site-title -> header',
      '0.2 core/template-part:footer -> footer',
    ])
  })

  it('reads an attribute the builder leaves out at its default: an Elementor video without video_type is YouTube', () => {
    const tree = [
      video({ youtube_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' }),
      video({ video_type: 'vimeo', vimeo_url: 'https://vimeo.com/76979871' }),
      video({ video_type: 'hosted' }),
    ]
    expect(claimMatches(tree, tables.elementor!).map(m => `${m.path} ${m.rule.component} ${m.rule.props?.url}`)).toEqual([
      '0.0 embed attr:youtube_url',
      '0.1 embed attr:vimeo_url',
    ])
    expect(attrsOf(tree[0]!, tables.elementor!.defaults).video_type).toBe('youtube')
    expect(attrsOf(tree[1]!, tables.elementor!.defaults).video_type).toBe('vimeo')
    // Without the table's defaults the default video matches nothing: the bug this guards.
    expect(claimMatches(tree, { ...tables.elementor!, defaults: {} })).toHaveLength(1)
  })
})

const leaf = (path: string, name: string, attrs?: Record<string, unknown>): SectionLeaf => ({ name, path, attrs })
const figureSlot = (numeric: boolean): SectionRule => ({ id: 'n.one', component: 'stats', slots: { v: { match: 'core/heading', numeric } }, into: 'items', each: '@v', item: { value: 'dom:' } })
const sectionTable = (builder: 'gutenberg' | 'elementor', sections: SectionRule[]): MappingTable => ({ format: 'astro-kit-mapping@1', builder, version: '1', fallback: 'prose', rules: [], sections })

/** A section match's slots without the empty ones: an empty slot is a key with no leaves (`intro: []`), only the filled ones say what the section reads. */
const filled = (slots: Record<string, string[]> | undefined) => Object.fromEntries(Object.entries(slots ?? {}).filter(([, paths]) => paths.length))

describe('section rules', () => {
  const hero: SectionRule = {
    id: 'hero.split', component: 'hero', variant: { layout: 'split' },
    when: { position: 'first', columns: [1, 2] },
    slots: {
      title: { match: 'elementor/heading', min: 1, max: 1, attr: { header_size: 'h1|h2' } },
      lead: { match: 'elementor/text-editor', max: 2 },
      button: { match: 'elementor/button', min: 1, max: 2 },
      media: { match: 'elementor/image', max: 1 },
    },
    props: { heading: '@title attr:title || @title dom:', image: '@media img:img' },
    into: 'actions', each: '@button', item: { label: 'attr:text', href: 'attr:link.url' },
  }
  const team: SectionRule = {
    id: 'team.columns', component: 'card-grid', when: { repeat: 'columns' },
    slots: { photo: { match: 'elementor/image', min: 1, max: 1 }, name: { match: 'elementor/heading', min: 1, max: 1 } },
    into: 'items', each: 'column', item: { title: '@name attr:title' },
  }
  const heroLeaves = [[leaf('0.0.0', 'elementor/heading', { header_size: 'h1' }), leaf('0.0.1', 'elementor/spacer'), leaf('0.0.2', 'elementor/text-editor')], [leaf('0.1.0', 'elementor/button'), leaf('0.1.1', 'elementor/image')]]

  it('claims leaves into slots in document order, skipping layout-only leaves', () => {
    expect(matchSection(hero, heroLeaves, { index: 0, count: 4 })).toEqual({
      slots: { title: ['0.0.0'], lead: ['0.0.2'], button: ['0.1.0'], media: ['0.1.1'] },
    })
  })

  it('refuses on position, column count, attr, a missing minimum or an unclaimed leaf', () => {
    expect(matchSection(hero, heroLeaves, { index: 1, count: 4 })).toBeNull()
    expect(matchSection(hero, [...heroLeaves, []], { index: 0, count: 4 })).toBeNull()
    expect(matchSection(hero, [[leaf('0', 'elementor/heading', { header_size: 'h3' }), leaf('1', 'elementor/button')]], { index: 0, count: 1 })).toBeNull()
    expect(matchSection(hero, [[leaf('0', 'elementor/heading', { header_size: 'h1' })]], { index: 0, count: 1 })).toBeNull()
    expect(matchSection(hero, [[leaf('0', 'elementor/heading', { header_size: 'h1' }), leaf('1', 'elementor/button'), leaf('2', 'elementor/counter')]], { index: 0, count: 1 })).toBeNull()
    expect(matchSection({ ...hero, when: { ...hero.when, only: false } }, [[leaf('0', 'elementor/heading', { header_size: 'h1' }), leaf('1', 'elementor/button'), leaf('2', 'elementor/counter')]], { index: 0, count: 1 })).not.toBeNull()
  })

  it('matches each column on its own for a repeated row, and keeps the per-column slots', () => {
    const cols = [0, 1, 2].map(i => [leaf(`0.${i}.0`, 'elementor/image'), leaf(`0.${i}.1`, 'elementor/heading')])
    expect(matchSection(team, cols, { index: 2, count: 4 })).toEqual({
      slots: { photo: ['0.0.0', '0.1.0', '0.2.0'], name: ['0.0.1', '0.1.1', '0.2.1'] },
      columns: [0, 1, 2].map(i => ({ photo: [`0.${i}.0`], name: [`0.${i}.1`] })),
    })
    expect(matchSection(team, [cols[0]!, [leaf('0.1.0', 'elementor/image')]], { index: 2, count: 4 })).toBeNull()
  })

  it('takes the first rule that fits and names it for the plan', () => {
    const table: MappingTable = { format: 'astro-kit-mapping@1', builder: 'elementor', version: '1', fallback: 'prose', rules: [], sections: [team, hero] }
    expect(classifySection(table, heroLeaves, { index: 0, count: 4 })?.rule.id).toBe('hero.split')
    expect(sectionRuleId('elementor', hero)).toBe('elementor:section:hero.split')
  })

  it('reads values as optional slot + mapping expression, with || alternatives', () => {
    expect(sectionValueSlots('@title attr:title || @title dom:')).toEqual(['title', 'title'])
    expect(sectionValueSlots('site:title')).toEqual([])
    expect(sectionValueSlots('@title innerHTML')).toBeNull()
  })

  it('validates section rules against the catalog', () => {
    const table: MappingTable = { format: 'astro-kit-mapping@1', builder: 'elementor', version: '1', fallback: 'prose', rules: [], sections: [hero, team] }
    expect(validateMapping(table, catalog)).toEqual([])
    const broken: MappingTable = { ...table, sections: [
      { ...hero, variant: { layout: 'diagonal' }, slots: { ...hero.slots, lead: { match: 'core/paragraph', max: 2 } }, props: { heading: '@lead dom:', lead: '@nope html:' } },
      { ...team, each: '@photo', item: { title: '@name attr:title' } },
      { ...team },
    ] }
    expect(validateMapping(broken, catalog)).toEqual([
      'elementor section hero.split: hero.layout has no option diagonal',
      'elementor section hero.split: slot lead matches core/paragraph, not a elementor or classic plugin element',
      'elementor section hero.split: heading is string but slot lead may hold several leaves (max must be 1)',
      'elementor section hero.split: lead reads undeclared slot nope',
      'elementor section team.columns: repeat columns needs each: column',
      'elementor section team.columns: items[].title reads a slot, but items of each @photo read their own leaf',
      'elementor section team.columns: listed twice',
    ])
  })

  it('reads an each selector inside the slot, a root value without a slot, and a root element condition', () => {
    const cover: SectionRule = {
      id: 'hero.cover', component: 'hero', variant: { layout: 'cover' }, when: { root: 'core/cover' },
      slots: { title: { match: 'core/heading', min: 1, max: 1 } },
      props: { heading: '@title dom:', image: 'img:img.wp-block-cover__image-background' },
    }
    const faq: SectionRule = {
      id: 'faq.accordion', component: 'faq', slots: { faq: { match: 'elementor/accordion', min: 1, max: 1 } },
      into: 'items', each: '@faq .elementor-accordion-item', item: { question: 'dom:.elementor-accordion-title', answer: 'html:.elementor-tab-content' },
    }
    expect(validateMapping(sectionTable('gutenberg', [cover]), catalog)).toEqual([])
    expect(validateMapping(sectionTable('elementor', [faq]), catalog)).toEqual([])
    const heading = [[leaf('0.0', 'core/heading')]]
    expect(matchSection(cover, heading, { index: 0, count: 2, root: 'core/cover' })).toEqual({ slots: { title: ['0.0'] } })
    expect(matchSection(cover, heading, { index: 0, count: 2, root: 'core/group' })).toBeNull()
    expect(matchSection(cover, heading, { index: 0, count: 2 })).toBeNull()
    expect(validateMapping(sectionTable('elementor', [{ ...faq, each: '@nope .elementor-accordion-item' }, { ...faq, id: 'faq.rooted', when: { root: 'core/cover' } }]), catalog)).toEqual([
      'elementor section faq.accordion: each @nope .elementor-accordion-item is not @<declared slot> [selector] or column',
      'elementor section faq.rooted: root core/cover is not a elementor element or run',
    ])
  })

  it('reads the leaves above a repeated row as the section\'s own slots, and the columns as items', () => {
    const rule: SectionRule = {
      id: 'x.columns', component: 'card-grid', when: { repeat: 'columns' },
      slots: { heading: { match: 'core/heading', max: 1, scope: 'intro' }, title: { match: 'core/heading', min: 1, max: 1 } },
      into: 'items', each: 'column', item: { title: '@title dom:' },
    }
    const cols = [0, 1].map(i => [leaf(`0.1.${i}.0`, 'core/heading')])
    expect(matchSection(rule, cols, { index: 0, count: 1, intro: [leaf('0.0', 'core/heading')] })).toEqual({
      slots: { heading: ['0.0'], title: ['0.1.0.0', '0.1.1.0'] },
      columns: [{ title: ['0.1.0.0'] }, { title: ['0.1.1.0'] }],
    })
    // Nothing above the row: the intro slot is simply empty. A leaf above that no intro slot takes refuses the rule.
    expect(matchSection(rule, cols, { index: 0, count: 1 })?.slots.heading).toEqual([])
    expect(matchSection(rule, cols, { index: 0, count: 1, intro: [leaf('0.0', 'core/heading'), leaf('0.0b', 'core/heading')] })).toBeNull()
    // Without a repeat the intro leaves are the section's first leaves.
    const single: SectionRule = { id: 'y.list', component: 'faq', slots: { title: { match: 'core/heading', max: 1 }, faq: { match: 'core/details', min: 2 } }, into: 'items', each: '@faq', item: { question: 'dom:summary', answer: 'dom:p' } }
    expect(matchSection(single, [[leaf('0.1', 'core/details'), leaf('0.2', 'core/details')]], { index: 0, count: 1, intro: [leaf('0.0', 'core/heading')] })?.slots).toEqual({ title: ['0.0'], faq: ['0.1', '0.2'] })
  })

  it('tells a figure from a word by the facts\' numeric flag, and rules a figure out the same way', () => {
    const figure = { ...leaf('0.0', 'core/heading'), numeric: true }
    expect(matchSection(figureSlot(true), [[figure]], { index: 0, count: 1 })).not.toBeNull()
    expect(matchSection(figureSlot(true), [[leaf('0.0', 'core/heading')]], { index: 0, count: 1 })).toBeNull()
    expect(matchSection(figureSlot(false), [[figure]], { index: 0, count: 1 })).toBeNull()
    expect(matchSection(figureSlot(false), [[leaf('0.0', 'core/heading')]], { index: 0, count: 1 })).not.toBeNull()
  })

  it('catches a when.order that cannot work: a name that is no slot, or an intro slot against a column slot', () => {
    const bad: MappingTable = sectionTable('gutenberg', [
      { id: 'o.name', component: 'stats', when: { order: ['figure', 'caption'] }, slots: { figure: { match: 'core/heading' } }, into: 'items', each: '@figure', item: { value: 'dom:' } },
      { id: 'o.scope', component: 'stats', when: { repeat: 'columns', order: ['title', 'figure'] }, slots: { title: { match: 'core/heading', max: 1, scope: 'intro' }, figure: { match: 'core/heading', min: 1, max: 1 } }, into: 'items', each: 'column', item: { value: '@figure dom:' } },
    ])
    expect(validateMapping(bad, catalog)).toEqual([
      'gutenberg section o.name: when.order names caption, which is not a slot',
      'gutenberg section o.scope: when.order compares an intro slot with a column slot',
    ])
  })

  it('catches an intro slot that cannot work: no repeat, or a column item reading it', () => {
    const bad: MappingTable = sectionTable('gutenberg', [
      { id: 'a.intro', component: 'faq', slots: { title: { match: 'core/heading', max: 1, scope: 'intro' }, faq: { match: 'core/details', min: 2 } }, props: { heading: '@title dom:' }, into: 'items', each: '@faq', item: { question: 'dom:summary', answer: 'dom:p' } },
      { id: 'a.reads', component: 'card-grid', when: { repeat: 'columns' }, slots: { heading: { match: 'core/heading', max: 1, scope: 'intro' }, title: { match: 'core/heading', min: 1, max: 1 } }, into: 'items', each: 'column', item: { title: '@heading dom:' } },
    ])
    expect(validateMapping(bad, catalog)).toEqual([
      'gutenberg section a.intro: slot title is scope intro, which needs when.repeat columns',
      'gutenberg section a.reads: items[].title reads intro slot heading, but the items of each column read their own column',
    ])
  })

  // The Gutenberg section idioms of WordPress's own pattern library, as facts leaves (tt5 launch and company).
  describe('Gutenberg figures, steps, plans, logos and quotes', () => {
    const g = (path: string, name: string, extra: Partial<SectionLeaf> = {}): SectionLeaf => ({ ...leaf(path, name), ...extra })
    const classify = (columns: SectionLeaf[][], meta: { index?: number, count?: number, root?: string, intro?: SectionLeaf[] } = {}) => classifySection(tables.gutenberg!, columns, { index: 1, count: 5, ...meta })
    const figure = (i: number) => [g(`0.${i}.0`, 'core/heading', { numeric: true }), g(`0.${i}.1`, 'core/paragraph')]

    it('a row of figures is stats, ahead of the card grid that has the same leaves', () => {
      expect(classify([0, 1, 2].map(figure), { root: 'core/columns' })?.rule.id).toBe('stats.columns')
      // A Gutenberg figure is a heading over its label: the page reads the figure first, as the source does.
      expect(classify([0, 1, 2].map(figure), { root: 'core/columns' })?.rule.variant).toEqual({ order: 'value-first' })
      // The same row with words for headings is a card grid.
      const words = [0, 1, 2].map(i => [g(`0.${i}.0`, 'core/heading'), g(`0.${i}.1`, 'core/paragraph')])
      expect(classify(words, { root: 'core/columns' })?.rule.id).toBe('card-grid.columns')
    })

    it('a row of figures under their labels is stats in the source order: the label first, the kit\'s default', () => {
      const labelled = (i: number) => [g(`0.${i}.0`, 'core/paragraph'), g(`0.${i}.1`, 'core/heading', { numeric: true })]
      const m = classify([0, 1, 2].map(labelled), { root: 'core/columns' })
      expect(m?.rule.id).toBe('stats.columns-label-first')
      expect(m?.rule.variant).toBeUndefined()
      // A figure with no label reads the same either way: the first rule takes it.
      expect(classify([0, 1, 2].map(i => [g(`0.${i}.0`, 'core/heading', { numeric: true })]), { root: 'core/columns' })?.rule.id).toBe('stats.columns')
      // A row that mixes the two orders is neither: no section of it reads its source in order.
      const mixed = [figure(0), labelled(1), figure(2)]
      expect(classify(mixed, { root: 'core/columns' })?.rule.component).not.toBe('stats')
    })

    it('a figures row under its own heading keeps the heading: stats with a title', () => {
      const m = classify([0, 1].map(i => figure(i + 1)), { root: 'core/group', intro: [g('0.0', 'core/heading'), g('0.0b', 'core/paragraph')] })
      expect(m?.rule.id).toBe('stats.columns')
      expect(m?.match.slots).toMatchObject({ heading: ['0.0'], lead: ['0.0b'], figure: ['0.1.0', '0.2.0'], label: ['0.1.1', '0.2.1'] })
    })

    it('numbered columns of heading and text are steps; the number is the paragraph, not the heading', () => {
      const step = (i: number) => [g(`0.${i}.0`, 'core/paragraph', { numeric: true, ordinal: true }), g(`0.${i}.1`, 'core/heading'), g(`0.${i}.2`, 'core/paragraph')]
      const m = classify([1, 2, 3].map(step), { root: 'core/group', intro: [g('0.0', 'core/heading')] })
      expect(m?.rule.id).toBe('steps.columns')
      expect(m?.match.columns?.[0]).toMatchObject({ number: ['0.1.0'], title: ['0.1.1'], text: ['0.1.2'] })
      // The source's "01" is the page's words: it is carried into the item, not redrawn by the list's counter.
      expect(m?.rule.item).toMatchObject({ number: '@number dom:' })
    })

    it('columns with a name, a figure price, a period, a list and a button are pricing plans', () => {
      const plan = (i: number) => [g(`0.${i}.0`, 'core/heading'), g(`0.${i}.1`, 'core/paragraph', { numeric: true }), g(`0.${i}.2`, 'core/paragraph'), g(`0.${i}.3`, 'core/list'), g(`0.${i}.4`, 'core/button')]
      const m = classify([1, 2, 3].map(plan), { root: 'core/group', intro: [g('0.0', 'core/heading')] })
      expect(m?.rule.id).toBe('pricing.columns')
      expect(m?.match.columns?.[1]).toMatchObject({ name: ['0.2.0'], price: ['0.2.1'], period: ['0.2.2'], features: ['0.2.3'], button: ['0.2.4'] })
      // A plan lists what it includes, and a price is a figure: without either the same columns are not plans.
      expect(classify([1, 2].map(i => [g(`0.${i}.0`, 'core/heading'), g(`0.${i}.1`, 'core/paragraph'), g(`0.${i}.2`, 'core/paragraph'), g(`0.${i}.3`, 'core/list')]), { root: 'core/group' })?.rule.id).not.toBe('pricing.columns')
    })

    it('a first section of one column with a picture under its text is the centred hero with its image (acf home)', () => {
      const text = [g('0.0', 'core/heading'), g('0.1', 'core/paragraph')]
      const pictured = classify([[...text, g('0.2', 'core/image'), g('0.3', 'core/button')]], { index: 0, root: 'core/group' })
      expect(pictured?.rule.id).toBe('hero.centered')
      expect(pictured?.match.slots).toEqual({ title: ['0.0'], lead: ['0.1'], button: ['0.3'], media: ['0.2'] })
      expect(pictured?.rule.props).toMatchObject({ image: '@media img:img' })
      // Without a picture the same hero, the same leaves: the media slot stays empty.
      const plain = classify([[...text, g('0.2', 'core/button')]], { index: 0, root: 'core/group' })
      expect(plain?.rule.id).toBe('hero.centered')
      expect(plain?.match.slots).toEqual({ title: ['0.0'], lead: ['0.1'], button: ['0.2'], media: [] })
      // The centred hero prints its image under the text: a picture above the heading is not it, nor are two pictures.
      expect(classify([[g('0.0', 'core/image'), ...text.map((l, i) => ({ ...l, path: `0.${i + 1}` }))]], { index: 0, root: 'core/group' })?.rule.id).not.toBe('hero.centered')
      expect(classify([[...text, g('0.2', 'core/image'), g('0.3', 'core/image')]], { index: 0, root: 'core/group' })?.rule.id).not.toBe('hero.centered')
    })

    it('a heading and four or more logo-sized pictures and nothing else are logos', () => {
      const logos = [g('0.0', 'core/heading'), ...[1, 2, 3, 4, 5].map(i => g(`0.${i}`, 'core/image', { small: true }))]
      expect(classify([logos], { root: 'core/group' })?.rule.id).toBe('logo-cloud.images')
      expect(classify([logos.slice(0, 4)], { root: 'core/group' })?.rule.id).not.toBe('logo-cloud.images')
      // A picture with words beside it is not a logo row.
      expect(classify([[...logos, g('0.9', 'core/paragraph')]], { root: 'core/group' })?.rule.id).not.toBe('logo-cloud.images')
      // Photos, and images whose size the facts did not state, are not logos.
      const photos = [g('0.0', 'core/heading'), ...[1, 2, 3, 4, 5].map(i => g(`0.${i}`, 'core/image'))]
      expect(classify([photos], { root: 'core/group' })?.rule.id).not.toBe('logo-cloud.images')
    })

    it('a timeline whose first paragraph is a year is not steps: the year stays in the text', () => {
      const entry = (i: number) => [g(`0.${i}.0`, 'core/paragraph', { numeric: true }), g(`0.${i}.1`, 'core/heading'), g(`0.${i}.2`, 'core/paragraph')]
      const m = classify([1, 2, 3].map(entry), { root: 'core/group', intro: [g('0.0', 'core/heading')] })
      expect(m?.rule.id).not.toBe('steps.columns')
      // Facts that predate the flags set neither: no new rule fires on them.
      const old = classify([1, 2, 3].map(i => [g(`0.${i}.0`, 'core/paragraph'), g(`0.${i}.1`, 'core/heading'), g(`0.${i}.2`, 'core/paragraph')]), { root: 'core/group' })
      expect(old?.rule.id).not.toBe('steps.columns')
    })

    it('columns of a picture and a quote are testimonials with their portraits', () => {
      const m = classify([0, 1].map(i => [g(`0.${i}.0`, 'core/image'), g(`0.${i}.1`, 'core/quote')]), { root: 'core/columns' })
      expect(m?.rule.id).toBe('testimonial.columns')
      expect(m?.match.columns?.[1]).toMatchObject({ avatar: ['0.1.0'], quote: ['0.1.1'] })
      expect(tables.gutenberg!.sections?.find(r => r.id === 'testimonial.columns')?.item).toMatchObject({ avatar: '@avatar img:img@src', avatarAlt: '@avatar img:img@alt', name: '@quote dom:cite' })
    })

    it('a titled card grid inside a group is a card grid with that title', () => {
      const cards = [0, 1, 2].map(i => [g(`0.${i + 1}.0`, 'core/heading'), g(`0.${i + 1}.1`, 'core/paragraph')])
      const m = classify(cards, { root: 'core/group', intro: [g('0.0', 'core/heading')] })
      expect(m?.rule.id).toBe('card-grid.columns')
      expect(m?.match.slots.heading).toEqual(['0.0'])
    })

    describe('a contact section keeps a button as a contact detail (tt5 contact: text and a mailto button above the form)', () => {
      const FORM = 'wpforms/form-selector'
      const contact = () => tables.gutenberg!.sections!.find(r => r.id === 'contact-form.form')!
      /** The rule as it was before the `details` slot: the output without a button must not move. */
      const before = () => {
        const { details: _details, ...slots } = contact().slots
        const { into: _into, each: _each, item: _item, ...rest } = contact()
        const old: SectionRule = { ...rest, slots }
        return { ...tables.gutenberg!, sections: tables.gutenberg!.sections!.map(r => (r.id === old.id ? old : r)) }
      }

      it('intro, a button, the form heading and the form are one contact section; the button is a detail with its link', () => {
        const m = classify([[g('0.0', 'core/paragraph'), g('0.1', 'core/button'), g('0.2', 'core/heading'), g('0.3', FORM)]], { index: 0, count: 1 })
        // The heading follows the intro in the source, so the section is the intro-first rule (heading placed after the details).
        expect(m?.rule.id).toBe('contact-form.intro-first')
        expect(m?.match.slots).toMatchObject({ intro: ['0.0'], details: ['0.1'], title: ['0.2'], form: ['0.3'] })
        expect(contact()).toMatchObject({ into: 'details', each: '@details', item: { value: 'dom:a', href: 'dom:a@href' } })
      })

      it('without a button the match is the one the rule gave before: same rule, same filled slots, no details leaf', () => {
        const cases: SectionLeaf[][][] = [
          [[g('0.0', 'core/heading'), g(`0.1`, FORM)]],
          [[g('0.0', 'core/heading'), g('0.1', 'core/paragraph'), g('0.2', FORM)]],
          [[g('0.0', 'core/heading'), g('0.1', 'core/paragraph'), g('0.2', 'core/heading'), g('0.3', FORM)]],
          [[g('0.0', 'core/paragraph'), g('0.1', FORM)]],
          [[g('0.0', FORM)]],
        ]
        for (const columns of cases) {
          const now = classify(columns, { index: 0, count: 1 })
          const was = classifySection(before(), columns, { index: 0, count: 1 })
          expect(now?.rule.id).toBe('contact-form.form')
          expect(filled(now?.match.slots)).toEqual(filled(was?.match.slots))
          expect(now?.match.slots.details).toEqual([])
        }
      })

      it('a heading written AFTER the intro puts the section in source order (heading after the details); a heading first keeps the heading on top', () => {
        const after = classify([[g('0.0', 'core/paragraph'), g('0.1', 'core/button'), g('0.2', 'core/heading'), g('0.3', FORM)]], { index: 0, count: 1 })
        expect(after?.rule.id).toBe('contact-form.intro-first')
        expect(after?.rule.variant).toEqual({ headingPlace: 'after' })
        expect(after?.match.slots).toMatchObject({ intro: ['0.0'], details: ['0.1'], title: ['0.2'], form: ['0.3'] })
        for (const columns of [
          [[g('0.0', 'core/heading'), g('0.1', 'core/paragraph'), g('0.2', 'core/button'), g('0.3', FORM)]],
          [[g('0.0', 'core/heading'), g('0.1', FORM)]],
          [[g('0.0', 'core/paragraph'), g('0.1', FORM)]],
        ]) {
          const top = classify(columns, { index: 0, count: 1 })
          expect(top?.rule.id).toBe('contact-form.form')
          expect(top?.rule.variant).toBeUndefined()
        }
      })

      it('the intro-first rule reads the same props as the heading-first rule: only the variant and the order differ', () => {
        const rules = tables.gutenberg!.sections!
        const first = rules.find(r => r.id === 'contact-form.intro-first')!
        const top = contact()
        expect(rules.indexOf(first)).toBeLessThan(rules.indexOf(top))
        const { id: _a, variant: _b, when: _c, slots: slotsFirst, ...restFirst } = first
        const { id: _d, variant: _e, when: _f, slots: slotsTop, ...restTop } = top
        expect(restFirst).toEqual(restTop)
        expect(slotsFirst.formTitle).toEqual(slotsTop.formTitle)
        expect(slotsFirst.details).toEqual(slotsTop.details)
        expect(slotsFirst.form).toEqual(slotsTop.form)
      })

      it('at most three buttons are details; a fourth leaves the section unmatched, a button with no form is no contact section', () => {
        const buttons = (n: number) => Array.from({ length: n }, (_, i) => g(`0.${i + 1}`, 'core/button'))
        expect(classify([[g('0.0', 'core/paragraph'), ...buttons(3), g('0.4', FORM)]], { index: 0, count: 1 })?.match.slots.details).toEqual(['0.1', '0.2', '0.3'])
        expect(classify([[g('0.0', 'core/paragraph'), ...buttons(4), g('0.5', FORM)]], { index: 0, count: 1 })?.rule.id).not.toBe('contact-form.form')
        expect(classify([[g('0.0', 'core/heading'), g('0.1', 'core/paragraph'), g('0.2', 'core/button')]], { index: 0, count: 1 })?.rule.id).not.toBe('contact-form.form')
      })
    })
  })

  // The golden Elementor site (migrate fixtures/golden/elementor/setup.php), as facts sections: leaves per column.
  describe('the golden Elementor pages', () => {
    const h = (path: string, size: string) => leaf(path, 'elementor/heading', { header_size: size })
    const w = (path: string, name: string) => leaf(path, `elementor/${name}`)
    const classify = (columns: SectionLeaf[][], index: number, count: number) => classifySection(tables.elementor!, columns, { index, count })?.rule.id
    it('home: hero, cards, split, carousel, testimonial', () => {
      expect([
        classify([[h('0.0', 'h1'), w('0.1', 'text-editor'), w('0.2', 'button')]], 0, 5),
        classify([[w('1.0', 'icon-box'), w('1.1', 'icon-box'), w('1.2', 'icon-box')]], 1, 5),
        classify([[w('2.0', 'image')], [h('2.1.0', 'h2'), w('2.1.1', 'text-editor'), w('2.1.2', 'icon-list')]], 2, 5),
        classify([[w('3.0', 'image-carousel')]], 3, 5),
        classify([[w('4.0', 'testimonial')]], 4, 5),
      ]).toEqual(['hero.centered', 'card-grid.icon-box', 'split.image-text', 'slider.carousel', 'testimonial.quotes'])
    })
    it('services, consulting and contact', () => {
      expect([
        classify([[h('0.0', 'h1'), w('0.1', 'text-editor')]], 0, 3),
        classify([[w('1.0', 'icon-box'), w('1.1', 'icon-box'), w('1.2', 'icon-box')]], 1, 3),
        classify([[h('2.0', 'h2'), w('2.1', 'form')]], 2, 3),
        classify([[h('0.0', 'h1'), w('0.1', 'text-editor'), w('0.2', 'button')]], 0, 1),
        classify([[h('0.0', 'h1'), w('0.1', 'text-editor'), w('0.2', 'icon-list')]], 0, 1),
      ]).toEqual(['hero.centered', 'card-grid.icon-box', 'contact-form.form', 'hero.centered', 'feature-list.icon-list'])
    })
    it('a contact section with its own form heading: the second heading is the form heading', () => {
      const match = classifySection(tables.elementor!, [[h('0.0', 'h1'), w('0.1', 'text-editor'), h('0.2', 'h2'), w('0.3', 'form')]], { index: 0, count: 1 })
      expect(match?.rule.id).toBe('contact-form.form')
      expect(match?.match.slots).toMatchObject({ title: ['0.0'], intro: ['0.1'], formTitle: ['0.2'], form: ['0.3'] })
    })
    it('a heading and text above a form section, joined: the icon list is the details, a plugin shortcode the form', () => {
      for (const form of [w('0.4', 'form'), leaf('0.4', 'classic/contact-form-7')]) {
        const match = classifySection(tables.elementor!, [[h('0.0', 'h1'), w('0.1', 'text-editor'), w('0.2', 'icon-list'), h('0.3', 'h2'), form]], { index: 0, count: 1 })
        expect(match?.rule.id, form.name).toBe('contact-form.form')
        expect(match?.match.slots, form.name).toMatchObject({ title: ['0.0'], intro: ['0.1'], details: ['0.2'], formTitle: ['0.3'], form: ['0.4'] })
      }
      // A detail keeps its tel:/mailto: link, as the prose it replaced did.
      expect(tables.elementor!.sections?.find(rule => rule.id === 'contact-form.form')).toMatchObject({ into: 'details', each: '@details .elementor-icon-list-item', item: { value: 'dom:.elementor-icon-list-text', href: 'dom:a@href' } })
    })

    // Launch and about: a heading above a row of containers, as facts split it (intro + columns) and flag it.
    describe('rows of steps, plans and people', () => {
      const f = (path: string, size: string, flags: Partial<SectionLeaf>) => ({ ...h(path, size), ...flags })
      const row = (columns: SectionLeaf[][], intro: SectionLeaf[] = [h('0.0', 'h2')]) => classifySection(tables.elementor!, columns, { index: 4, count: 9, root: 'elementor/container', intro })
      const step = (i: number) => [f(`0.1.${i}.0`, 'span', { numeric: true, ordinal: true }), f(`0.1.${i}.1`, 'h3', { numeric: false, ordinal: false }), w(`0.1.${i}.2`, 'text-editor')]
      const plan = (i: number) => [f(`0.1.${i}.0`, 'h3', { numeric: false }), f(`0.1.${i}.1`, 'div', { numeric: true }), w(`0.1.${i}.2`, 'text-editor'), w(`0.1.${i}.3`, 'icon-list'), w(`0.1.${i}.4`, 'button')]
      const person = (i: number, flags: Partial<SectionLeaf> = { portrait: true }, role: Partial<SectionLeaf> = { short: true }) => [{ ...w(`0.1.${i}.0`, 'image'), ...flags }, f(`0.1.${i}.1`, 'h3', { numeric: false }), { ...w(`0.1.${i}.2`, 'text-editor'), ...role }]

      it('numbered columns are steps in a row; the number is the span heading and stays out of the title', () => {
        const m = row([0, 1, 2].map(step))
        expect(m?.rule.id).toBe('steps.columns')
        expect(m?.rule.variant).toEqual({ layout: 'row', style: 'numbered' })
        expect(m?.match.slots.heading).toEqual(['0.0'])
        expect(m?.match.columns?.[2]).toEqual({ number: ['0.1.2.0'], title: ['0.1.2.1'], text: ['0.1.2.2'] })
        expect(m?.rule.item).toMatchObject({ number: '@number attr:title || @number dom:' })
      })

      it('columns of a name, a figure price, a period, a list and a button are plans', () => {
        const m = row([0, 1, 2].map(plan))
        expect(m?.rule.id).toBe('pricing.columns')
        expect(m?.match.columns?.[0]).toEqual({ name: ['0.1.0.0'], price: ['0.1.0.1'], period: ['0.1.0.2'], features: ['0.1.0.3'], button: ['0.1.0.4'] })
      })

      it('columns of a portrait, a name and a role are the team; the same columns with any other picture are not', () => {
        const m = row([0, 1, 2, 3].map(i => person(i)))
        expect(m?.rule.id).toBe('team.columns')
        expect(m?.match.columns?.[3]).toEqual({ photo: ['0.1.3.0'], name: ['0.1.3.1'], role: ['0.1.3.2'] })
        for (const flags of [{}, { small: true }, { portrait: false }]) expect(row([0, 1, 2, 3].map(i => person(i, flags)))?.rule.id).not.toBe('team.columns')
      })

      it('a square photo over a title and a description is not the team: the role is one short line (t6, #234)', () => {
        for (const role of [{}, { short: false }]) expect(row([0, 1, 2, 3].map(i => person(i, { portrait: true }, role)))?.rule.id).not.toBe('team.columns')
      })

      it('fires on nothing the facts do not split and flag: today\'s flat column stays as it was', () => {
        const flat = (cols: SectionLeaf[][]) => classifySection(tables.elementor!, [[h('0.0', 'h2'), ...cols.flat()]], { index: 4, count: 9, root: 'elementor/container' })?.rule.id
        for (const cols of [[0, 1, 2].map(step), [0, 1, 2].map(plan), [0, 1, 2, 3].map(i => person(i))]) {
          expect(['steps.columns', 'pricing.columns', 'team.columns']).not.toContain(flat(cols))
          expect(['steps.columns', 'pricing.columns', 'team.columns']).not.toContain(row(cols.map(unflagged))?.rule.id)
        }
        // The logo row is untouched: a heading and images, flags or none.
        expect(classify([[h('1.0', 'h2'), ...[1, 2, 3, 4, 5].map(i => w(`1.${i}`, 'image'))]], 1, 9)).toBe('logo-cloud.images')
      })
    })
  })
})

describe('the page reads a section in the source order (G-text)', () => {
  const statsRule = (builder: string) => tables[builder]!.sections?.find(r => r.component === 'stats')
  it('figures first where the source writes the figure first, the counter title first where Elementor does', () => {
    expect(statsRule('gutenberg')?.variant).toEqual({ order: 'value-first' })
    expect(statsRule('gutenberg')?.when?.order).toEqual(['figure', 'label'])
    expect(statsRule('divi')?.variant).toEqual({ order: 'value-first' })
    // The Elementor counter names itself before its number: the kit's default.
    expect(statsRule('elementor')?.variant?.order).toBeUndefined()
  })
})

describe('carousel, tabs and disclosure rules', () => {
  // Facts count a carousel's slides without the copies its script makes (Swiper, Slick, Splide, Owl clone the ends),
  // so a rule that selects the clones too would give more items than the source shows.
  const CLONES: Record<string, string> = {
    'classic/swiper': 'swiper-slide-duplicate', 'classic/slick': 'slick-cloned', 'classic/splide': 'splide__slide--clone', 'classic/owl': 'cloned',
    'elementor/nested-carousel': 'swiper-slide-duplicate', 'elementor/testimonial-carousel': 'swiper-slide-duplicate', 'elementor/reviews': 'swiper-slide-duplicate',
  }
  it.each(Object.entries(CLONES))('%s selects each slide once, never a script\'s copy', (match, clone) => {
    const rule = Object.values(tables).flatMap(table => table.rules).find(r => r.match === match)!
    expect(rule.each, match).toContain(`:not(.${clone})`)
    expect(Object.keys(rule.item ?? {}).length, match).toBeGreaterThan(1)
  })

  it('maps a plain disclosure run, a post carousel and the review widgets', () => {
    const rule = (match: string) => Object.values(tables).flatMap(table => table.rules).find(r => r.match === match)
    expect(rule('classic/details')).toMatchObject({ component: 'faq', each: 'details' })
    expect(rule('elementor/loop-carousel')).toMatchObject({ component: 'slider', bind: 'collection:posts' })
    expect(rule('elementor/reviews')).toMatchObject({ component: 'testimonial', variant: { layout: 'row' } })
  })

  // A popup becomes a dialog the visitor opens: its title and text are read, the button and close names are interface strings.
  it.each(['elementor/popup', 'classic/popup-maker'])('%s maps to a dialog opened by a button', (match) => {
    const rule = Object.values(tables).flatMap(table => table.rules).find(r => r.match === match)!
    expect(rule.component).toBe('dialog')
    expect(rule.props).toMatchObject({ triggerLabel: 'ui:dialog.open', closeLabel: 'ui:dialog.close' })
    // A CTA popup keeps its buttons: the popup's own links become the dialog's actions.
    expect(rule.into).toBe('actions')
    // Elementor's own popup controls (`href="#elementor-action:action=popup:close"`, popup:open, lightbox) are not actions.
    expect(rule.each).toBe(match === 'elementor/popup' ? "a.elementor-button:not([href^='#elementor-action'])" : '.pum-content a.button')
    expect(rule.item).toEqual({ label: 'dom:', href: 'dom:@href' })
    expect(rule.props?.html, match).toMatch(/^html:/)
  })

  // A tab's panel is a sibling of its title, not inside it: each tabs rule reads the panels from the section root,
  // the i-th panel for the i-th title (`html@root:`).
  it.each(['elementor/tabs', 'elementor/nested-tabs', 'divi/et_pb_tabs', 'classic/tabs', 'classic/aria-tabs'])('%s reads its panels from the section root', (match) => {
    const rule = Object.values(tables).flatMap(table => table.rules).find(r => r.match === match)!
    expect(rule.component).toBe('tabs')
    expect(rule.item?.content).toMatch(/^html@root:/)
    expect(rule.props?.label).toBe('ui:tabs.label')
  })
})
