import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { instanceId } from '../components/_shared/instance-id'

describe('instanceId', () => {
  it('gives each instance on a page its own id, in render order, and starts again on the next page', () => {
    const page = {}
    expect([instanceId(page, undefined, 'gallery'), instanceId(page, undefined, 'gallery'), instanceId(page, undefined, 'gallery')]).toEqual(['gallery', 'gallery-2', 'gallery-3'])
    expect(instanceId(page, undefined, 'faq')).toBe('faq')
    expect(instanceId({}, undefined, 'gallery')).toBe('gallery')
  })

  it('keeps an id the page gives, and a default steps around it', () => {
    const page = {}
    expect(instanceId(page, 'gallery', 'gallery')).toBe('gallery')
    expect(instanceId(page, undefined, 'gallery')).toBe('gallery-2')
    expect(instanceId(page, 'gallery-3', 'gallery')).toBe('gallery-3')
    expect(instanceId(page, undefined, 'gallery')).toBe('gallery-4')
  })

  it('two galleries of the very same images still get two ids (no hash of the content)', () => {
    const page = {}
    expect(instanceId(page, undefined, 'gallery')).not.toBe(instanceId(page, undefined, 'gallery'))
  })
})

describe('components with a default id', () => {
  // Their labels, tabs, lightboxes and buttons point at ids: each takes its default through instanceId, never as a
  // constant every instance on the page would share.
  it.each([
    ['contact-details/ContactDetails.astro', 'contact-details'], ['contact-form/ContactForm.astro', 'contact'], ['faq/Faq.astro', 'faq'],
    ['gallery/Gallery.astro', 'gallery'], ['nav/Nav.astro', 'site-nav'], ['post-list/PostList.astro', 'posts'], ['newsletter/Newsletter.astro', 'newsletter'],
    ['search-box/SearchBox.astro', 'site-search'], ['tabs/Tabs.astro', 'tabs'], ['slider/SliderTrack.astro', 'slider'], ['slider/Slider.astro', 'slider'], ['dialog/Dialog.astro', 'dialog'],
    // Every other section, so a theme or a design layer can address each one.
    ['hero/Hero.astro', 'hero'], ['cta/Cta.astro', 'cta'], ['feature-list/FeatureList.astro', 'feature-list'], ['logo-cloud/LogoCloud.astro', 'logo-cloud'],
    ['pricing/Pricing.astro', 'pricing'], ['split/Split.astro', 'split'], ['stats/Stats.astro', 'stats'], ['steps/Steps.astro', 'steps'], ['team/Team.astro', 'team'],
    ['testimonial/Testimonial.astro', 'testimonial'], ['card-grid/CardGrid.astro', 'card-grid'], ['behavior/Behavior.astro', 'behavior'],
  ])('%s', async (file, base) => {
    const source = await readFile(join(import.meta.dirname, '..', 'components', file), 'utf8')
    expect(source).toMatch(new RegExp(`instanceId\\(Astro\\.locals, .*'${base}'\\)`))
    expect(source).not.toContain(`id = '${base}'`)
  })
})
