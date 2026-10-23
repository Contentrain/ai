import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CONTENT = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter', 'src', 'lib', 'content.ts')

interface P { id: string, data: { slug: string, parent?: { id: string } } }

/** The starter's own `isHomePage`, run as written with a given `siteConfig`, on a site in one language. */
async function homeOf(home: { kind: 'page', slug: string } | { kind: 'posts' }) {
  const source = await readFile(CONTENT, 'utf8')
  const body = /^function isHomePage\(page: Page, pages: ReadonlyMap<string, Page>\): boolean \{\n([\s\S]+?)\n\}$/m.exec(source)?.[1]
  expect(body).toBeTruthy()
  // eslint-disable-next-line no-new-func
  const run = new Function('siteConfig', 'multilingual', 'defaultLocale', 'entryLocale', 'isHomePage', 'page', 'pages', body!) as (config: unknown, multilingual: boolean, defaultLocale: string, entryLocale: () => string, self: unknown, page: P, pages: Map<string, P>) => boolean
  const isHomePage = (page: P, pages: Map<string, P>): boolean => run({ home }, false, 'en', () => 'en', isHomePage, page, pages)
  return (page: P, pages: P[]) => isHomePage(page, new Map(pages.map(p => [p.id, p])))
}

describe('the front page among pages sharing its slug', () => {
  const top: P = { id: 'a', data: { slug: 'home' } }
  const child: P = { id: 'b', data: { slug: 'home', parent: { id: 'c' } } }
  const parent: P = { id: 'c', data: { slug: 'services' } }

  it('is the top-level page; a child page with that slug keeps its own address', async () => {
    const isHome = await homeOf({ kind: 'page', slug: 'home' })
    expect(isHome(top, [top, child, parent])).toBe(true)
    expect(isHome(child, [top, child, parent])).toBe(false)
    expect(isHome(parent, [top, child, parent])).toBe(false)
  })

  it('is a child page only when no other page has its slug, and never on a posts home', async () => {
    expect((await homeOf({ kind: 'page', slug: 'home' }))(child, [child, parent])).toBe(true)
    expect((await homeOf({ kind: 'posts' }))(top, [top])).toBe(false)
  })

  it('decides pageHref\'s root', async () => {
    expect(await readFile(CONTENT, 'utf8')).toContain("  if (isHomePage(page, pages)) return localizedPath(withBase('/'), locale)\n")
  })
})
