import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { attrsOf, claimMatches, classifySection, KIT_BUILDERS, matchSection, rulesFor, sectionRuleId, sectionValueSlots, unmappedSources, validateMapping, type KitCatalog, type MappingTable, type SectionLeaf, type SectionRule } from '../src/index'

const ROOT = join(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(join(ROOT, 'catalog.json'), 'utf8')) as KitCatalog
const video = (attrs: Record<string, unknown>) => ({ name: 'elementor/video', attrs })
const tables = Object.fromEntries(await Promise.all(KIT_BUILDERS.map(async b => [b, JSON.parse(await readFile(join(ROOT, 'mapping', `${b}.json`), 'utf8')) as MappingTable] as const)))

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
    expect(rulesFor(tables.gutenberg!, 'core/cover')[0]).toMatchObject({ component: 'hero', variant: { layout: 'cover', align: 'class:is-position-*-left=start|center' } })
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
const sectionTable = (builder: 'gutenberg' | 'elementor', sections: SectionRule[]): MappingTable => ({ format: 'astro-kit-mapping@1', builder, version: '1', fallback: 'prose', rules: [], sections })

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
      'elementor section hero.split: slot lead matches core/paragraph, not a elementor element',
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
  })
})
