import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { attrsOf, claimMatches, KIT_BUILDERS, rulesFor, unmappedSources, validateMapping, type KitCatalog, type MappingTable } from '../src/index'

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
