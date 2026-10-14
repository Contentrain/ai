import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS = join(import.meta.dirname, '..', 'components')

const astroFiles = async (): Promise<string[]> => {
  const dirs = (await readdir(COMPONENTS, { withFileTypes: true })).filter(entry => entry.isDirectory())
  const files = await Promise.all(dirs.map(async dir => (await readdir(join(COMPONENTS, dir.name))).filter(file => file.endsWith('.astro')).map(file => `${dir.name}/${file}`)))
  return files.flat().toSorted()
}

describe('section hooks', () => {
  it('every section a component renders names the component (data-kit-section) and carries its id', async () => {
    const missing: string[] = []
    let sections = 0
    for (const file of await astroFiles()) {
      if (file.startsWith('_shared/')) continue
      const source = await readFile(join(COMPONENTS, file), 'utf8')
      const component = file.split('/')[0]!
      for (const tag of source.matchAll(/<Section\b[^>]*>/g)) {
        sections++
        if (!tag[0].includes(`kit="${component}"`) || !/\bid=\{id\}/.test(tag[0])) missing.push(`${file}: ${tag[0].slice(0, 80)}`)
      }
    }
    expect(missing).toEqual([])
    expect(sections).toBeGreaterThanOrEqual(23)
  })

  it('Section writes the component id into data-kit-section, so `[data-kit-section]` still matches every section', async () => {
    const section = await readFile(join(COMPONENTS, '_shared', 'Section.astro'), 'utf8')
    expect(section).toContain("data-kit-section={kit ?? ''}")
  })

  it('a framed carousel, a section of its own, carries the same hooks and keeps its own padding', async () => {
    const track = await readFile(join(COMPONENTS, 'slider', 'SliderTrack.astro'), 'utf8')
    expect(track).toContain("id={framed ? id : undefined}")
    expect(track).toContain("data-kit-section={framed ? 'slider' : undefined} data-kit-spacing={framed ? 'none' : undefined}")
  })
})

describe('quieter text', () => {
  // Dimmed text lays its colour over the band, and on a mid-tone band that falls under 4.5:1: quieter text is the
  // band's muted role (`_shared/muted.ts`). Opacity is left only where nothing is text, each with its reason; back to
  // full (`opacity-100`) dims nothing.
  const allowed = new Map([
    ['embed/Embed.astro', ['opacity-80', 'group-hover:opacity-65']], // the poster image under the play button
    ['slider/SliderTrack.astro', ['disabled:opacity-40', 'disabled:opacity-40', 'opacity-85', 'group-hover/play:opacity-70']], // arrow buttons at the ends, a video's poster image
    ['testimonial/Testimonial.astro', ['opacity-40', 'opacity-80', 'opacity-60', 'opacity-25']], // the decorative quote mark, the company logo, half and empty rating stars
    ['logo-cloud/LogoCloud.astro', ['opacity-70']], // grayscale logos
    ['consent/Consent.astro', ['hover:opacity-90']], // the accept button's fill
    ['pricing/Pricing.astro', ['opacity-50']], // the hidden dash of a feature a plan lacks (the cell's text is sr-only)
    ['nav/Nav.astro', ['opacity-80']], // a submenu's chevron button, an icon
  ])

  it('no component dims text with opacity', async () => {
    const found = new Map<string, string[]>()
    for (const file of await astroFiles()) {
      const source = await readFile(join(COMPONENTS, file), 'utf8')
      const uses = [...source.matchAll(/[\w:/[\]=-]*\bopacity-\d+\b/g)].map(match => match[0]).filter(cls => !cls.endsWith('opacity-100'))
      if (uses.length) found.set(file, uses)
    }
    expect(Object.fromEntries(found)).toEqual(Object.fromEntries(allowed))
  })
})
