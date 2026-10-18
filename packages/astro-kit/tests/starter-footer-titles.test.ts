import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STARTER = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter', 'src')

describe('the starter\'s footer menus are named by the heading the site prints, never by an admin name over it', () => {
  it('a column with a heading is named by it (no aria-label from the menu name); one without keeps the name', async () => {
    const layout = await readFile(join(STARTER, 'layouts', 'BaseLayout.astro'), 'utf8')
    expect(layout).toContain('({ label: menu.title ? undefined : menu.name, title: menu.title, links:')
  })

  it('a lone footer menu (the simple layout, no visible heading) is named by its heading before its name', async () => {
    const layout = await readFile(join(STARTER, 'layouts', 'BaseLayout.astro'), 'utf8')
    expect(layout).toContain("navLabel={footerColumns[0]?.title ?? footerColumns[0]?.name ?? t('nav.footer')}")
  })

  it('the heading comes from the menu entry\'s own title, absent when empty', async () => {
    const links = await readFile(join(STARTER, 'lib', 'links.ts'), 'utf8')
    expect(links).toContain('({ name: menu.data.name, title: menu.data.title || undefined, items: await menuItems(menu) })')
  })
})
