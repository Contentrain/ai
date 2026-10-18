import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const STARTER = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter')

// The starter's own file, compiled here: imported, it would be read under the starter's tsconfig, which extends astro's
// (not installed in the template). It imports nothing, so it runs as it is.
const source = await readFile(join(STARTER, 'src', 'lib', 'body-tables.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} as { scrollingTables: (html: string, label: string) => string } }
// eslint-disable-next-line no-new-func -- the starter's module, read from its file
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const { scrollingTables } = loaded.exports
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

  it('every page body takes it: publicHtml wraps with the site\'s table.label, which every locale names', async () => {
    const links = await readFile(join(STARTER, 'src', 'lib', 'links.ts'), 'utf8')
    expect(links).toContain("if (result.includes('<table')) result = scrollingTables(result, (await getStrings())('table.label'))")
    const dir = join(STARTER, '.contentrain', 'content', 'site', 'ui-strings')
    const locales = await readdir(dir)
    expect(locales.length).toBeGreaterThan(1)
    for (const file of locales) expect(JSON.parse(await readFile(join(dir, file), 'utf8'))['table.label'], file).toBeTruthy()
    // The table keeps its display (no `display: block` on it); the region scrolls.
    const css = await readFile(join(STARTER, 'src', 'styles', 'wp-blocks.css'), 'utf8')
    expect(css).toContain('.prose .table-scroll { overflow-x: auto;')
    expect(css).not.toMatch(/table[^{]*\{[^}]*display:\s*block/)
  })
})
