import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS = join(import.meta.dirname, '..', 'components')
const read = (...path: string[]) => readFile(join(COMPONENTS, ...path), 'utf8')
const SHARES = ['15', '27', '34', '42']

describe('inset: the content column starts at an axis from md', () => {
  it('is none by default on Prose, Hero and Band, so a section without it is drawn as before', async () => {
    expect(await read('prose', 'Prose.astro')).toContain("defaultVariants: { size: 'lg', inset: 'none' }")
    expect(await read('hero', 'Hero.astro')).toContain("stackOrder: 'text-first', inset: 'none', imageBleed: 'none' }")
    expect(await read('band', 'Band.astro')).toContain("tone: 'default', inset: 'none' }")
    // Band's column keeps the classes it had inline.
    expect(await read('band', 'Band.astro')).toContain("column: 'flex flex-col gap-10',")
    for (const meta of ['prose', 'hero', 'band']) {
      const inset = JSON.parse(await read(meta, 'meta.json')).variants.inset
      expect(inset.options).toEqual(['none', ...SHARES])
      expect(inset.default).toBe('none')
    }
  })

  it('moves the start edge only from md, by a logical margin (the axis is measured from the right in RTL), a fixed class per share', async () => {
    const prose = await read('prose', 'Prose.astro')
    expect(prose).toContain("inset: { none: '', '15': 'md:ms-[15%]', '27': 'md:ms-[27%]', '34': 'md:ms-[34%]', '42': 'md:ms-[42%]' }")
    const hero = await read('hero', 'Hero.astro')
    const band = await read('band', 'Band.astro')
    for (const share of SHARES) {
      expect(hero).toContain(`{ layout: 'centered', inset: '${share}', class: { copy: 'md:ms-[${share}%]' } }`)
      expect(band).toContain(`{ layout: 'stack', inset: '${share}', class: { column: 'md:ms-[${share}%]' } }`)
    }
    for (const source of [prose, hero, band]) expect(source).not.toMatch(/(?<![\w-])(?:md:)?ml-\[/)
  })

  it('sets a centred hero or band at the axis from md, and leaves split and cover alone', async () => {
    const hero = await read('hero', 'Hero.astro')
    expect(hero).toContain("{ layout: 'centered', inset: ['15', '27', '34', '42'], class: { copy: 'md:items-start md:text-start', lead: 'md:mx-0', points: 'md:justify-start', actions: 'md:justify-start' } }")
    expect(hero).not.toMatch(/layout: '(?:split|cover)', inset:/)
    const band = await read('band', 'Band.astro')
    expect(band).toContain("{ layout: 'stack', align: 'center', inset: ['15', '27', '34', '42'], class: { copy: 'md:mx-0 md:items-start md:text-start', actions: 'md:justify-start', item: 'md:items-start md:text-start' } }")
    expect(band).not.toMatch(/layout: 'split', inset:/)
  })
})
