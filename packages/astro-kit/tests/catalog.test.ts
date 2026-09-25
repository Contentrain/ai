import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import type { FieldDef } from '@contentrain/types'
import { componentsForSource, planCopy, validateCatalog, type KitCatalog } from '../src/index'

const ROOT = join(import.meta.dirname, '..')
const COMPONENTS = join(ROOT, 'components')
const catalog = JSON.parse(await readFile(join(ROOT, 'catalog.json'), 'utf8')) as KitCatalog

/** Keys of `interface Props { … }` in an .astro frontmatter. */
function propsOf(source: string): string[] {
  const body = /interface Props \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
  return [...body.matchAll(/^ {2}(?:'([^']+)'|(\w+))\??:/gm)].map(match => match[1] ?? match[2]!)
}

describe('catalog', () => {
  it('is in sync with components/*/meta.json', () => {
    expect(() => execFileSync('node', ['scripts/build-catalog.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' })).not.toThrow()
  })

  it('validates', () => {
    expect(validateCatalog(catalog)).toEqual([])
  })

  it('names the first fifteen components', () => {
    expect(catalog.components.map(c => c.id)).toEqual(expect.arrayContaining([
      'header', 'nav', 'footer', 'hero', 'card-grid', 'post-card', 'cta', 'faq', 'tabs', 'testimonial', 'gallery', 'slider', 'contact-form', 'pagination', 'breadcrumb',
    ]))
  })

  it('spells out every object prop, nested ones too — a section model built from the catalog types each field', () => {
    const loose: string[] = []
    const walk = (fields: Record<string, FieldDef> | undefined, at: string) => {
      for (const [name, def] of Object.entries(fields ?? {})) {
        if (def.type === 'object' && !def.fields) loose.push(`${at}${name}`)
        walk(def.fields, `${at}${name}.`)
        if (typeof def.items === 'object') {
          if (def.items.type === 'object' && !def.items.fields) loose.push(`${at}${name}[]`)
          walk(def.items.fields, `${at}${name}[].`)
        }
      }
    }
    for (const c of catalog.components) walk(c.props as Record<string, FieldDef>, `${c.id}.`)
    expect(loose).toEqual([])
  })

  it('says for every component which builder elements feed it', () => {
    for (const c of catalog.components) expect(Object.values(c.sources).flat().length, c.id).toBeGreaterThan(0)
  })

  for (const c of catalog.components) {
    describe(c.id, () => {
      it('documents exactly the props its Props interface declares, variants included', async () => {
        const main = c.files.find(file => file.endsWith('.astro'))!
        const declared = propsOf(await readFile(join(COMPONENTS, c.id, main), 'utf8'))
        const documented = [...Object.keys(c.props), ...Object.keys(c.variants), 'class'].toSorted()
        expect(declared.filter(name => name !== 'class').toSorted()).toEqual(documented.filter(name => name !== 'class'))
      })

      it('lets every optional prop be passed through as undefined (exactOptionalPropertyTypes)', async () => {
        const main = c.files.find(file => file.endsWith('.astro'))!
        const body = /interface Props \{([\s\S]*?)\n\}/.exec(await readFile(join(COMPONENTS, c.id, main), 'utf8'))?.[1] ?? ''
        const bare = body.split('\n').filter(line => /^ {2}(?:'[^']+'|\w+)\?:/.test(line) && !line.includes('| undefined'))
        expect(bare).toEqual([])
      })

      it('uses every variant option it lists (in its own files or a shared one it passes the variant to)', async () => {
        const own = await Promise.all(c.files.map(file => readFile(join(COMPONENTS, c.id, file), 'utf8')))
        const shared = await Promise.all(c.shared.map(file => readFile(join(COMPONENTS, '_shared', file), 'utf8')))
        const source = [...own, ...shared].join('\n')
        for (const [axis, variant] of Object.entries(c.variants)) {
          for (const option of variant.options) expect(source, `${axis}=${option}`).toContain(option)
        }
      })

      it('lists the shared files it imports, and they exist', async () => {
        const shared = new Set(await readdir(join(COMPONENTS, '_shared')))
        const source = (await Promise.all(c.files.map(file => readFile(join(COMPONENTS, c.id, file), 'utf8')))).join('\n')
        const imported = [...source.matchAll(/from '\.\.\/_shared\/([^']+?)'/g)].map(match => match[1]!.endsWith('.astro') ? match[1]! : `${match[1]}.ts`)
        for (const file of c.shared) expect(shared.has(file), file).toBe(true)
        expect([...new Set(imported)].toSorted()).toEqual([...c.shared].toSorted())
      })

      it('lists the kit components it renders', async () => {
        const source = (await Promise.all(c.files.map(file => readFile(join(COMPONENTS, c.id, file), 'utf8')))).join('\n')
        const rendered = [...source.matchAll(/from '\.\.\/([a-z-]+)\/[A-Za-z]+\.astro'/g)].map(match => match[1]!).filter(id => id !== '_shared')
        expect([...new Set(rendered)].toSorted()).toEqual([...c.uses].toSorted())
      })

      it('has visual fixtures covering every variant option', async () => {
        const fixtures = JSON.parse(await readFile(join(COMPONENTS, c.id, 'fixtures.json'), 'utf8')) as Array<{ name: string, props: Record<string, unknown> }>
        expect(fixtures.length).toBeGreaterThan(0)
        for (const [axis, variant] of Object.entries(c.variants)) {
          const covered = new Set(fixtures.map(f => String(f.props[axis] ?? variant.default)))
          expect([...covered].toSorted(), `${c.id}.${axis}`).toEqual([...variant.options].toSorted())
        }
      })
    })
  }
})

describe('planCopy', () => {
  it('brings along the components and shared files a component renders', () => {
    const plan = planCopy(catalog, ['header'])
    expect(plan.components).toEqual(['header', 'nav'])
    expect(plan.files['src/components/kit/nav/Nav.astro']).toBe('nav/Nav.astro')
    expect(plan.files['src/components/kit/_shared/Button.astro']).toBe('_shared/Button.astro')
    expect(plan.dependencies['tailwind-variants']).toBeDefined()
  })

  it('refuses an unknown component', () => {
    expect(() => planCopy(catalog, ['carousel-3d'])).toThrow(/no component "carousel-3d"/)
  })
})

describe('componentsForSource', () => {
  it('finds the component a builder element maps to', () => {
    expect(componentsForSource(catalog, 'core/navigation').map(c => c.id)).toContain('nav')
  })
})

describe('templates/astro-starter', () => {
  it('carries kit components as exact copies', async () => {
    // The starter's chrome and list components are kit components; a fix made
    // in one place and not the other would split them.
    const starterKit = join(ROOT, '..', '..', 'templates', 'astro-starter', 'src', 'components', 'kit')
    const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(join(starterKit, dir), { withFileTypes: true })).map(entry =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : Promise.resolve([join(dir, entry.name)]),
    ))).flat()
    const files = await walk('.')
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(await readFile(join(starterKit, file), 'utf8'), file).toBe(await readFile(join(COMPONENTS, file), 'utf8'))
    }
  })
})
