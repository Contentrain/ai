import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const STARTER = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter')

// The starter's own file, compiled here (as `starter-body-tables.test.ts` does): it imports nothing, so it runs as it is.
const source = await readFile(join(STARTER, 'src', 'lib', 'menu-areas.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
type Menu = { data: { slug: string, locations?: string[] } }
const loaded = { exports: {} as { placedIn: (area: 'header' | 'footer', menus: Menu[], configured: string[]) => Menu[] } }
// eslint-disable-next-line no-new-func -- the starter's module, read from its file
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const { placedIn } = loaded.exports
const menu = (slug: string, ...locations: string[]): Menu => ({ data: { slug, ...(locations.length ? { locations } : {}) } })
const slugs = (menus: Menu[]) => menus.map(m => m.data.slug)

describe('the menus each area shows', () => {
  it('the header is site.config\'s primary menu, whatever its theme location (a theme\'s header-menu, a topbar-menu beside it)', () => {
    const menus = [menu('footer-menu', 'footer-menu'), menu('topbar-menu', 'topbar-menu'), menu('products'), menu('main-nav', 'header-menu'), menu('footer-links')]
    expect(slugs(placedIn('header', menus, ['main-nav']))).toEqual(['main-nav'])
    expect(slugs(placedIn('footer', menus, ['footer-menu', 'footer-links']))).toEqual(['footer-menu', 'footer-links'])
  })

  it('without a primary menu of that slug, the header reads the locations: a theme\'s own name for it, never a top bar\'s', () => {
    expect(slugs(placedIn('header', [menu('topbar', 'topbar-menu'), menu('main', 'header-menu')], ['primary']))).toEqual(['main'])
    expect(slugs(placedIn('header', [menu('a', 'top'), menu('b', 'footer')], ['primary']))).toEqual(['a'])
    expect(slugs(placedIn('header', [menu('topbar', 'top-bar'), menu('social', 'social')], ['primary']))).toEqual([])
    // A menu with no location shows where site.config names it.
    expect(slugs(placedIn('header', [menu('nav')], ['nav']))).toEqual(['nav'])
  })
})
