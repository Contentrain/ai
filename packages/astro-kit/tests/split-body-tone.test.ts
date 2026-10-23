import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { proseOnBand } from '../components/_shared/muted'

const COMPONENTS = join(import.meta.dirname, '..', 'components')

describe('a Split body on a band (prose follows the section, not the page)', () => {
  it('binds Typography\'s text roles to the band\'s own colour and its quieter roles to the band\'s muted role', () => {
    for (const role of ['body', 'headings', 'bold', 'quotes', 'code']) expect(proseOnBand, role).toContain(`[--tw-prose-${role}:currentColor]`)
    for (const role of ['lead', 'counters', 'bullets', 'captions']) expect(proseOnBand, role).toContain(`[--tw-prose-${role}:var(--kit-muted,var(--color-ink-muted))]`)
    expect(proseOnBand).not.toMatch(/opacity|prose-invert/)
  })

  it('gives the body that binding on every tone, and a link on a fill the fill\'s ink', async () => {
    const split = await readFile(join(COMPONENTS, 'split', 'Split.astro'), 'utf8')
    expect(split).toContain("import { muted, proseOnBand } from '../_shared/muted'")
    expect(split).toContain('body: `prose prose-site max-w-none text-pretty ${proseOnBand}`,')
    expect(split).toContain("accent: { body: '[--tw-prose-links:currentColor]' }, brand: { body: '[--tw-prose-links:currentColor]' }")
  })

  it('keeps the wp-demo fixture\'s copy of the shared helpers identical', async () => {
    const kit = await readFile(join(COMPONENTS, '_shared', 'muted.ts'), 'utf8')
    const demo = await readFile(join(import.meta.dirname, '..', '..', '..', 'templates', 'fixtures', 'wp-demo', 'src', 'components', 'kit', '_shared', 'muted.ts'), 'utf8')
    expect(demo).toBe(kit)
  })
})
