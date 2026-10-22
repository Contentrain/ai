import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const KIT = join(import.meta.dirname, '..')
const COPIES = [join(KIT, 'components', 'post-card', 'PostCard.astro'), join(KIT, '..', '..', 'templates', 'astro-starter', 'src', 'components', 'kit', 'post-card', 'PostCard.astro')]

/** x12's post list (t2): the source's own "READ ARTICLE" under each card, its short dates, and excerpts over 75 characters a line at 1280. */
describe('PostCard: the source\'s read-more words, its date style, and a readable excerpt line', () => {
  it('the kit and the starter\'s copy are the same file', async () => {
    const [kit, starter] = await Promise.all(COPIES.map(path => readFile(path, 'utf8')))
    expect(starter).toBe(kit)
  })

  it('prints the read-more words only on a linked card, as words: the title link stays the one link', async () => {
    const card = await readFile(COPIES[0]!, 'utf8')
    expect(card).toContain('{href && moreLabel && <p class="text-sm font-semibold text-accent-text" aria-hidden="true">{moreLabel}</p>}')
    expect(card.match(/<a href=\{safeHref\(href\)\}/g)).toHaveLength(1)
  })

  it('writes the date in the style it is given, long when none is', async () => {
    const card = await readFile(COPIES[0]!, 'utf8')
    expect(card).toContain("dateStyle = 'long'")
    expect(card).toContain('toLocaleDateString(locale, { dateStyle, timeZone })')
    expect(card).not.toContain("dateStyle: 'long'")
  })

  it('caps the excerpt at ~62ch a line in every layout (75ch ran ~95 real characters, over the 90 limit)', async () => {
    const card = await readFile(COPIES[0]!, 'utf8')
    expect(card).toContain("excerpt: 'max-w-[62ch] text-ink-muted'")
  })

  it('the starter\'s lists pass the site\'s read-more words and date style; absent, the card is as before', async () => {
    const list = await readFile(join(KIT, '..', '..', 'templates', 'astro-starter', 'src', 'views', 'ListView.astro'), 'utf8')
    expect(list).toContain('moreLabel={siteConfig.lists.moreLabel} dateStyle={siteConfig.lists.dateStyle}')
  })
})
