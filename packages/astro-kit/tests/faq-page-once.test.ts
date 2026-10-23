import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { firstOnPage } from '../components/_shared/once-per-page'

const FAQ = join(import.meta.dirname, '..', 'components', 'faq', 'Faq.astro')

describe('the page\'s FAQPage, from its first FAQ', () => {
  it('is claimed once per page: the first caller gets it, later ones on that page do not, another page starts over', () => {
    const page = {}
    expect(firstOnPage(page, 'faq-page')).toBe(true)
    expect(firstOnPage(page, 'faq-page')).toBe(false)
    expect(firstOnPage(page, 'other')).toBe(true)
    expect(firstOnPage({}, 'faq-page')).toBe(true)
  })

  it('is on by default, and a FAQ with no answered question leaves the turn to the next one', async () => {
    const source = await readFile(FAQ, 'utf8')
    expect(source).toContain('schema = true')
    expect(source).toContain("const structured = schema && withText.length > 0 && firstOnPage(Astro.locals, 'faq-page')")
  })
})
