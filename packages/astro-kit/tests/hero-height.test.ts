import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS = join(import.meta.dirname, '..', 'components')
const read = (...path: string[]) => readFile(join(COMPONENTS, ...path), 'utf8')

describe('the hero\'s height and where its content sits', () => {
  it('is auto and start by default, so a hero without them is drawn as before', async () => {
    const hero = await read('hero', 'Hero.astro')
    expect(hero).toContain("inset: 'none', contentAt: 'start', imageBleed: 'none' }")
    expect(hero).toContain("const screen = height === 'screen' && !(cover && width === 'content') ? SCREEN : undefined")
    // Without screen the cover's class is the literal it was, and the other's is what bleeds alone made it.
    expect(hero).toContain("class={screen ? `relative isolate overflow-hidden ${screen}` : 'relative isolate overflow-hidden'}")
    expect(hero).toContain("class={[bleeds && 'overflow-x-clip', screen].filter(Boolean).join(' ') || undefined}")
    const meta = JSON.parse(await read('hero', 'meta.json')).variants
    expect(meta.height).toMatchObject({ options: ['auto', 'screen'], default: 'auto' })
    expect(meta.contentAt).toMatchObject({ options: ['start', 'end'], default: 'start' })
  })

  it('takes the window\'s height only from sm, less the header a site measures, with 100vh where 100svh is unknown', async () => {
    const hero = await read('hero', 'Hero.astro')
    const screen = /const SCREEN = '([^']+)'/.exec(hero)?.[1].split(' ') ?? []
    expect(screen).toContain('sm:min-h-[calc(100vh-var(--header-h,0px))]')
    expect(screen).toContain('sm:supports-[height:100svh]:min-h-[calc(100svh-var(--header-h,0px))]')
    // Every class waits for sm: on a phone the hero is as tall as its content.
    for (const name of screen) expect(name.startsWith('sm:'), name).toBe(true)
  })

  it('places the content on the bottom edge by the grid\'s own alignment, the section\'s padding kept under it', async () => {
    expect(await read('hero', 'Hero.astro')).toContain("contentAt: { start: {}, end: { grid: 'content-end' } },")
  })
})
