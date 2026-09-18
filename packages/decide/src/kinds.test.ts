import { describe, expect, it } from 'vitest'
import { eligibilityBand, eligibilityRule, shapeEligibility } from './kinds/eligibility-band.js'
import { punchItemRule, severityLevel, shapePunchItem } from './kinds/punch-item.js'
import { scrubSlug, scrubText } from './kinds/shape.js'
import { site } from './test-support.js'

describe('scrubText', () => {
  it('replaces URLs, e-mail addresses and root-relative paths, and collapses whitespace', () => {
    expect(scrubText('see https://example.org/a?b=1 or www.example.org\n  and  mail ops@example.org (/assets/38d5.webp) /wp-content/x.png', 200))
      .toBe('see <url> or <url> and mail <email> (<path>) <path>')
  })

  it('leaves arithmetic and ratios alone', () => {
    expect(scrubText('en kötü sayfa 56.4 < 80 · 1/3 ölçüldü', 200)).toBe('en kötü sayfa 56.4 < 80 · 1/3 ölçüldü')
  })

  it('cuts to the limit with an ellipsis', () => {
    expect(scrubText('abcdefghij', 5)).toBe('abcd…')
  })

  it('scrubSlug keeps slug characters only', () => {
    expect(scrubSlug('WooCommerce Product!')).toBe('woocommerce-product')
  })
})

describe('punch_item', () => {
  it('keeps whether there is a link but not the link, hashes the site into a group, and scrubs label and reason', () => {
    const shaped = shapePunchItem({
      label: '(aile: page-0)',
      reason: 'şablon hero sızıntısı — 6 sayfa aynı görseli basıyor (/assets/409246aec03b8886.jpg)',
      link: 'https://example.org/page/',
      site: { name: 'example-org', url: 'https://example.org', decision: 'KABUL + PUNCH LIST', median: 99.4, mobile_median: Number.NaN },
    })
    expect(shaped).toEqual({
      label: '(aile: page-0)',
      reason: 'şablon hero sızıntısı — 6 sayfa aynı görseli basıyor (<path>)',
      linked: true,
      site: { group: expect.stringMatching(/^[0-9a-f]{16}$/), decision: 'KABUL + PUNCH LIST', median: 99.4, mobile_median: null },
    })
    expect(JSON.stringify(shaped)).not.toMatch(/example/)
    expect(shapePunchItem({ label: 'a', reason: 'b' }).site).toEqual({ group: '', decision: null, median: null, mobile_median: null })
  })

  it('has a tentative class for run-report phrasings it recognises, and no opinion otherwise', () => {
    expect(punchItemRule({ label: 'x', reason: 'ölçülemedi (bot engeli/zaman aşımı)' })).toEqual({ choice: 'measurement', confidence: 1, final: false })
    expect(punchItemRule({ label: 'x', reason: 'gövde yuvası yok — içerik veriden gelmiyor' })?.choice).toBe('source_limit')
    expect(punchItemRule({ label: 'x', reason: 'şablon hero sızıntısı — 1 sayfa' })?.choice).toBe('product_defect')
    expect(punchItemRule({ label: 'x', reason: 'en kötü sayfa 56.4 < 80' })).toBeUndefined()
  })

  it('maps the 0–3 score onto 1–4 levels', () => {
    expect([0, 0.49, 0.5, 1.41, 2.68, 3].map(severityLevel)).toEqual([1, 1, 2, 2, 4, 4])
  })
})

describe('eligibility_band', () => {
  it('keeps counts only: sampled records never leave, custom types are sorted and scrubbed', () => {
    const shaped = shapeEligibility(site(12, [['Product', 30], ['portfolio', 0], ['event', 4]]))
    expect(shaped).toEqual({
      access: 'open', rest_reachable: true, posts: 12, pages: 3, post_samples: 5, page_samples: 3,
      custom_types: [{ slug: 'event', count: 4 }, { slug: 'product', count: 30 }],
    })
    expect(JSON.stringify(shaped)).not.toContain('Private title')
    expect(eligibilityBand.jev!.render(shaped)).toBe('access=open; rest=reachable; posts=12 (sampled 5); pages=3 (sampled 3); custom post types: event=4, product=30')
  })

  it('is certain where judgeEligibility is clear', () => {
    expect(eligibilityRule({ ...site(5), access: 'bot_wall' })).toEqual({ choice: 'access_blocked', confidence: 1, final: true })
    expect(eligibilityRule({ ...site(5), rest: { ...site(5).rest, reachable: false } }).choice).toBe('access_blocked')
    expect(eligibilityRule(site(40))).toEqual({ choice: 'eligible', confidence: 1, final: true })
    expect(eligibilityRule(site(40, [['product', 5]]))).toEqual({ choice: 'eligible', confidence: 1, final: true })
    expect(eligibilityRule(site(2, [['product', 5000]]))).toEqual({ choice: 'custom_type', confidence: 1, final: true })
    expect(eligibilityRule(site(0, [], 8))).toEqual({ choice: 'page_only', confidence: 1, final: true })
    expect(eligibilityRule(site(0, [['product', 30]]))).toEqual({ choice: 'custom_type', confidence: 1, final: true })
    expect(eligibilityRule(site(0, [], 0))).toEqual({ choice: 'access_blocked', confidence: 1, final: true })
  })

  it('is tentative in the band, keeping judgeEligibility\'s answer as the fallback', () => {
    expect(eligibilityRule(site(20, [['product', 30]]))).toEqual({ choice: 'custom_type', confidence: 0.5, final: false })
    expect(eligibilityRule(site(20, [['product', 12]]))).toEqual({ choice: 'eligible', confidence: 0.5, final: false })
    expect(eligibilityRule(site(1, [], 6))).toEqual({ choice: 'page_only', confidence: 0.5, final: false })
    expect(eligibilityRule(site(1, [['product', 3]]))).toEqual({ choice: 'custom_type', confidence: 0.5, final: false })
  })

  it('never offers needs_human to a provider', () => {
    expect(eligibilityBand.choices).not.toContain('needs_human')
    expect(Object.keys((eligibilityBand.jev!.questions('item1').eligibility as { criteria: object }).criteria)).not.toContain('needs_human')
    expect(eligibilityBand.lowConfidence).toEqual({ threshold: 0.5, choice: 'needs_human' })
  })
})
