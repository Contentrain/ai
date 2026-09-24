import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KIT_BUILDERS, rulesFor, unmappedSources, validateMapping, type KitCatalog, type MappingTable } from '../src/index'

const ROOT = join(import.meta.dirname, '..')
const catalog = JSON.parse(await readFile(join(ROOT, 'catalog.json'), 'utf8')) as KitCatalog
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

  it('catches what a broken rule gets wrong', () => {
    const broken: MappingTable = {
      format: 'astro-kit-mapping@1', builder: 'elementor', version: '1', fallback: 'prose',
      rules: [
        { match: 'elementor/icon-box', component: 'card-grid', variant: { columns: '5' }, into: 'items', item: { heading: 'dom:h3', title: 'innerHTML' } },
        { match: 'core/cover', component: 'hero' },
        { match: 'elementor/nav-menu', component: 'nav', props: { items: 'menu:sidebar' } },
      ],
    }
    expect(validateMapping(broken, catalog)).toEqual([
      'elementor elementor/icon-box: card-grid.columns has no option 5',
      'elementor elementor/icon-box: card-grid.items[] has no field heading',
      'elementor elementor/icon-box: items[].title = innerHTML is not a mapping value',
      'elementor elementor/icon-box: into items needs each, group or bind to say what repeats',
      'elementor core/cover: not a elementor element',
      'elementor core/cover: component hero is not in the catalog',
      'elementor elementor/nav-menu: items = menu:sidebar is not a mapping value',
    ])
  })

  it('finds the most specific rule first', () => {
    const rules = rulesFor(tables.gutenberg!, 'core/template-part')
    expect(rules.map(r => r.match)).toEqual(['core/template-part:header', 'core/template-part:footer'])
    expect(rulesFor(tables.gutenberg!, 'core/query').map(r => r.component)).toEqual(['post-card'])
  })
})
