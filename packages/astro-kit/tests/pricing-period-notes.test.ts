import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pricing's period notes (M-5, the kinsta toggle, ORK 2026-10-17): a struck original price, a note under the price
 * and a line by the button for each billing period, and a line by the toggle for its second option. Each is printed
 * only where it is given, so a plan without them renders exactly as before; the Alt ones only where the Alt price
 * is, swapping with it. The real-browser check in visual.mjs chooses each option and reads what shows.
 */
const read = () => readFile(join(import.meta.dirname, '..', 'components/pricing/Pricing.astro'), 'utf8')

describe('Pricing period notes', () => {
  it('prints each new line only where its field is given', async () => {
    const pricing = await read()
    expect(pricing).toContain('{plan.priceWas && <del class={s.was()}>')
    expect(pricing).toContain('{plan.priceNote && <p class={s.note()} data-price="main">{plan.priceNote}</p>}')
    expect(pricing).toContain('{plan.priceFoot && <p class={s.foot({ class: \'mb-3\' })} data-price="main">{plan.priceFoot}</p>}')
    expect(pricing).toContain('{toggled && billingAltNote && <p class={s.altNote()} data-price="alt">{billingAltNote}</p>}')
    // A plan with no button and no foot prints no empty action box.
    expect(pricing).toContain('{!(plan.ctaLabel && plan.ctaHref) && (plan.priceFoot || (toggled && plan.priceAlt && plan.priceFootAlt)) && (')
  })

  it('prints an Alt line only with the Alt price, marked to swap with it', async () => {
    const pricing = await read()
    expect(pricing).toContain('{plan.priceWasAlt && <del class={s.was()}><span class="sr-only">{wasLabel} </span>{plan.priceWasAlt}</del>}')
    expect(pricing).toContain('{toggled && plan.priceAlt && plan.priceNoteAlt && <p class={s.note()} data-price="alt">{plan.priceNoteAlt}</p>}')
    expect(pricing.match(/toggled && plan\.priceAlt && plan\.priceFootAlt && <p class=\{s\.foot\([^)]*\)\} data-price="alt">/g)).toHaveLength(2)
  })

  it('never falls back to the main value: a first-period line is hidden with the second option, even with no Alt value', async () => {
    const pricing = await read()
    // Every first-period line is marked main (hidden while the second option is chosen); no Alt line reads a main field.
    for (const field of ['priceNote', 'priceFoot']) expect(pricing).not.toMatch(new RegExp(`${field}Alt \\?\\? plan\\.${field}|${field}Alt \\|\\| plan\\.${field}`))
    expect(pricing).not.toMatch(/priceWasAlt \?\? plan\.priceWas|priceWasAlt \|\| plan\.priceWas/)
    expect(pricing.match(/data-price="main">\{plan\.price(?:Note|Foot)\}/g)).toHaveLength(3)
    expect(pricing).toContain('<p class={s.price()} data-price={toggled && !plan.priceAlt ? undefined : \'main\'}>\n                {plan.priceWas && <del')
  })

  it('a plan with no priceAlt keeps its price line under both options; its notes stay first-period lines', async () => {
    const pricing = await read()
    // Unmarked when toggled without an Alt price, so neither option hides it; marked main everywhere else (unchanged).
    expect(pricing.match(/<p class=\{s\.price\(\)\} data-price=/g)).toHaveLength(2)
    expect(pricing).toContain("data-price={toggled && !plan.priceAlt ? undefined : 'main'}")
    expect(pricing).toContain('{toggled && plan.priceAlt && (\n                <p class={s.price()} data-price="alt">')
    // The notes do not follow the price: still main, still hidden with the second option.
    expect(pricing).toContain('{plan.priceNote && <p class={s.note()} data-price="main">{plan.priceNote}</p>}')
  })

  it('reads a struck price as "Was …": a strike alone is not announced', async () => {
    const pricing = await read()
    expect(pricing).toContain("wasLabel = 'Was'")
    expect(pricing.match(/<del class=\{s\.was\(\)\}><span class="sr-only">\{wasLabel\} <\/span>/g)).toHaveLength(2)
  })
})
