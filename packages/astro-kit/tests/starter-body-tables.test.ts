import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const STARTER = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter')

// The starter's own file, compiled here: imported, it would be read under the starter's tsconfig, which extends astro's
// (not installed in the template). It imports nothing, so it runs as it is.
const source = await readFile(join(STARTER, 'src', 'lib', 'body-tables.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} as { scrollingTables: (html: string, label: string) => string, tableLabel: (t: (key: string) => string) => string } }
// eslint-disable-next-line no-new-func -- the starter's module, read from its file
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const { scrollingTables, tableLabel } = loaded.exports
const region = (name: string) => `<div class="table-scroll" role="region" tabindex="0" ${name}>`
const TABLE = '<table><tr><td>a</td></tr></table>'

describe('a table in rich text with no table block around it scrolls in a named region', () => {
  it('wraps a bare table, named by the label, and leaves the rest as written', () => {
    expect(scrollingTables(`<p>x</p>${TABLE}<p>y</p>`, 'Table')).toBe(`<p>x</p>${region('aria-label="Table"')}${TABLE}</div><p>y</p>`)
    expect(scrollingTables('<p>no table</p>', 'Table')).toBe('<p>no table</p>')
  })

  it('is named by the caption: its id where it has one, else its text', () => {
    const captioned = '<table>\n<caption>Plans <b>"2026"</b> &amp; prices</caption><tr><td>a</td></tr></table>'
    expect(scrollingTables(captioned, 'Table')).toBe(`${region('aria-label="Plans &quot;2026&quot; &amp; prices"')}${captioned}</div>`)
    const withId = '<table><caption id="plans">Plans</caption><tr><td>a</td></tr></table>'
    expect(scrollingTables(withId, 'Table')).toBe(`${region('aria-labelledby="plans"')}${withId}</div>`)
  })

  it('leaves a table block\'s table (its figure scrolls already) and a table already in a region', () => {
    const block = `<figure class="wp-block-table is-style-stripes">${TABLE}<figcaption>c</figcaption></figure>`
    expect(scrollingTables(block, 'Table')).toBe(block)
    const once = scrollingTables(TABLE, 'Table')
    expect(scrollingTables(once, 'Table')).toBe(once)
  })

  it('wraps only the outermost of nested tables, and each of two in a row', () => {
    const nested = `<table><tr><td>${TABLE}</td></tr></table>`
    expect(scrollingTables(nested, 'Table')).toBe(`${region('aria-label="Table"')}${nested}</div>`)
    expect(scrollingTables(`${TABLE}${TABLE}`, 'T')).toBe(`${region('aria-label="T"')}${TABLE}</div>${region('aria-label="T"')}${TABLE}</div>`)
  })

  it('a table after a closed table block is wrapped (the block does not hold it)', () => {
    const block = `<figure class="wp-block-table">${TABLE}</figure>`
    expect(scrollingTables(`${block}${TABLE}`, 'Table')).toBe(`${block}${region('aria-label="Table"')}${TABLE}</div>`)
  })

  it('names a region "Table" where no locale has table.label (the dictionary would print the key)', () => {
    expect(tableLabel(key => key)).toBe('Table')
    expect(tableLabel(key => (key === 'table.label' ? 'Tablo' : key))).toBe('Tablo')
  })

  it('every page body and rich custom field takes it, with the site\'s table.label, which every locale names', async () => {
    const links = await readFile(join(STARTER, 'src', 'lib', 'links.ts'), 'utf8')
    expect(links).toContain("if (result.includes('<table')) result = scrollingTables(result, tableLabel(await getStrings()))")
    const fields = await readFile(join(STARTER, 'src', 'lib', 'fields.ts'), 'utf8')
    expect(fields).toContain("html: value.includes('<table') ? scrollingTables(value, tableLabel(await getStrings())) : value")
    const dir = join(STARTER, '.contentrain', 'content', 'site', 'ui-strings')
    const locales = await readdir(dir)
    expect(locales.length).toBeGreaterThan(1)
    for (const file of locales) expect(JSON.parse(await readFile(join(dir, file), 'utf8'))['table.label'], file).toBeTruthy()
    // The region scrolls and the table in it keeps its display; only an unwrapped table falls back to scrolling itself.
    const css = await readFile(join(STARTER, 'src', 'styles', 'wp-blocks.css'), 'utf8')
    expect(css).toContain('.prose .table-scroll { overflow-x: auto;')
    const blocks = [...css.matchAll(/([^{}]*table[^{}]*)\{([^}]*display:\s*block[^}]*)\}/g)].map(m => m[1]!.trim().split('\n').at(-1))
    expect(blocks).toEqual(['.prose table:not(.wp-block-table table, .table-scroll table)'])
  })
})
