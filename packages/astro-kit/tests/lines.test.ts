import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS = join(import.meta.dirname, '..', 'components')

describe('a heading the author broke into lines (Hero headingLines)', () => {
  it('prints the heading as it was unless `lines` is asked for: middle output does not move', async () => {
    const hero = await readFile(join(COMPONENTS, 'hero', 'Hero.astro'), 'utf8')
    const headings = [...hero.matchAll(/<Heading [^>]*>([\s\S]*?)<\/Heading>/g)].map(match => match[1])
    expect(headings).toHaveLength(3)
    for (const inner of headings) expect(inner).toBe("{headingLines === 'lines' ? <Lines text={heading} /> : heading}")
    expect(hero).toContain("headingLines: 'flow' }")
  })

  it('one block per line, numbered for a theme, with a space between them so the heading reads as one sentence', async () => {
    const lines = await readFile(join(COMPONENTS, '_shared', 'Lines.astro'), 'utf8')
    expect(lines).toContain(".split('\\n')")
    expect(lines).toContain('<span class="block" data-kit-line={i + 1}>')
    expect(lines).toContain("{i > 0 && ' '}")
    // A single line is printed as it is: no span, no marker.
    expect(lines).toContain(': Astro.props.text}')
  })
})
