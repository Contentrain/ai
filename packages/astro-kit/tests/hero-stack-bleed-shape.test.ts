import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS = join(import.meta.dirname, '..', 'components')
const read = (...path: string[]) => readFile(join(COMPONENTS, ...path), 'utf8')

describe('the hero\'s image first, to the window\'s edge, and Split\'s masks', () => {
  it('leaves a hero and a split as they were unless the new options are asked for', async () => {
    const hero = await read('hero', 'Hero.astro')
    expect(hero).toContain("headingLines: 'flow', stackOrder: 'text-first', inset: 'none', imageBleed: 'none' }")
    expect(hero).toContain("stackOrder: { 'text-first': {}, 'media-first': { media: 'order-first' } }")
    expect(hero).toContain("const bleeds = !cover && image && imageBleed !== undefined && imageBleed !== 'none'")
    expect(hero).toContain("class={bleeds ? 'overflow-x-clip' : undefined}")
    const split = await read('split', 'Split.astro')
    expect(split).toContain("defaultVariants: { imageSide: 'end', ratio: '1:1', imageFit: 'contain', imageShape: 'rounded'")
  })

  it('takes the window\'s edge from one shared rule, Split\'s, so the two never drift apart', async () => {
    const bleed = await read('_shared', 'bleed.ts')
    // The page frame caps its width with its gutter inside (`container-page`), so the edge is what the frame leaves of the
    // window, halved, plus that gutter: without it the image stopped 32px short above 1216px.
    const edge = 'calc((100vw-min(var(--container-page)+2*var(--container-inset,0px),100vw))/2+var(--spacing-gutter,2rem))'
    expect(bleed).toContain(`end: 'md:-me-[${edge}]'`)
    expect(bleed).toContain(`start: 'md:-ms-[${edge}]'`)
    for (const component of [['hero', 'Hero.astro'], ['split', 'Split.astro']]) {
      const source = await read(...component)
      expect(source).toContain("import { BLEED } from '../_shared/bleed'")
      expect(source).not.toContain('const BLEED')
    }
    for (const meta of ['hero', 'split']) expect(JSON.parse(await read(meta, 'meta.json')).shared).toContain('bleed.ts')
    // A centered hero's image is full width of its column: it lets go of that width, or the margins only shift it.
    expect(await read('hero', 'Hero.astro')).toContain('`max-w-none md:w-auto ${BLEED.start} ${BLEED.end}`')
  })

  it('lets only an image that comes last cross the bottom: overlap with media-first draws as edge, never over the text', async () => {
    const hero = await read('hero', 'Hero.astro')
    expect(hero).toContain("const bleedAs = imageBleed === 'overlap' && stackOrder === 'media-first' ? 'edge' : imageBleed")
    expect(hero).toContain('imageBleed: bleedAs })')
  })

  it('draws a mask from a fixed set of classes, never a value from content, and dims no text', async () => {
    const split = await read('split', 'Split.astro')
    expect(split).toContain("arch: { media: 'rounded-t-full', image: 'h-full' },")
    expect(split).toContain("chamfer: { media: '[clip-path:polygon(0_0,82%_0,100%_18%,100%_100%,0_100%)]' },")
    expect(split).toContain("blob: { media: 'rounded-[38%_62%_55%_45%/48%_42%_58%_52%]' },")
    expect(JSON.parse(await read('split', 'meta.json')).variants.imageShape.options).toEqual(['none', 'rounded', 'circle', 'arch', 'chamfer', 'blob'])
    for (const component of [['hero', 'Hero.astro'], ['split', 'Split.astro']]) expect(await read(...component)).not.toMatch(/opacity/)
  })
})
