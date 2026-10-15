import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { wordmarkBox } from '../components/footer/footer'

const COMPONENTS = join(import.meta.dirname, '..', 'components')
const read = (...path: string[]) => readFile(join(COMPONENTS, ...path), 'utf8')

describe('the footer wordmark: the site name once more, as wide as the footer', () => {
  it('sizes a box the name fills at or under its width, letter by letter, so the stretch only adds spacing', () => {
    expect(wordmarkBox('Northwind', 'fit')).toEqual({ size: 157, baseline: 122, height: 157 })
    expect(wordmarkBox('Northwind', 'crop')).toEqual({ size: 157, baseline: 122, height: 66 })
    // Capitals are guessed wider than lower case, full-width letters (CJK) at a full em with a lower baseline.
    expect(wordmarkBox('NORTHWIND STUDIO', 'fit')!.size).toBeLessThan(wordmarkBox('Northwind Studio', 'fit')!.size)
    expect(wordmarkBox('北風スタジオ', 'fit')).toEqual({ size: 158, baseline: 139, height: 174 })
    // Letters, not UTF-16 units, and the name's own spaces at its ends do not count.
    expect(wordmarkBox(' Çay ', 'fit')).toEqual(wordmarkBox('Çay', 'fit'))
  })

  it('draws none for a name letter spacing would break (joined and clustered scripts), or no name', () => {
    expect(wordmarkBox('استوديو الشمال', 'fit')).toBeUndefined()
    expect(wordmarkBox('סטודיו צפון', 'crop')).toBeUndefined()
    expect(wordmarkBox('उत्तर स्टूडियो', 'fit')).toBeUndefined()
    expect(wordmarkBox('สตูดิโอ', 'fit')).toBeUndefined()
    expect(wordmarkBox('  ', 'fit')).toBeUndefined()
  })

  it('is drawn only when asked for, hidden from screen readers, stretched to the box by letter spacing alone', async () => {
    const footer = await read('footer', 'Footer.astro')
    expect(footer).toContain("const mark = wordmark === 'fit' || wordmark === 'crop' ? wordmarkBox(siteName, wordmark) : undefined")
    const marks = [...footer.matchAll(/<svg [^>]*>[\s\S]*?<\/svg>/g)].map(match => match[0])
    expect(marks).toHaveLength(2)
    for (const svg of marks) {
      expect(svg).toContain('aria-hidden="true"')
      expect(svg).toContain('focusable="false"')
      expect(svg).toContain('textLength="1000" lengthAdjust="spacing"')
      expect(svg).toContain('fill-current')
      expect(svg).toContain('>{siteName}</text>')
    }
    expect(footer).toContain("{mark && wordmarkOrder === 'first' &&")
    expect(footer).toContain("{mark && wordmarkOrder !== 'first' &&")
  })
})

describe('text the author broke into lines, in a band and a quote', () => {
  it('prints the band\'s heading and lead as they were unless `lines` is asked for', async () => {
    const band = await read('band', 'Band.astro')
    expect(band).toContain("{headingLines === 'lines' ? <Lines text={heading} /> : heading}")
    expect(band).toContain("{leadLines === 'lines' ? <Lines text={lead} /> : lead}")
  })

  it('keeps a quote in one paragraph, its marks on the first line and the last, never on a line of their own', async () => {
    const quote = await read('testimonial', 'Testimonial.astro')
    expect(quote).toContain("const lined = (text: string) => quoteLines === 'lines' && text.split('\\n').filter(line => line.trim()).length > 1")
    expect(quote).toContain('<p class:list={[quoteMark === \'marks\' && !quoted(item.quote) && "[&>[data-kit-line]:first-of-type]:before:content-[open-quote] [&>[data-kit-line]:last-of-type]:after:content-[close-quote]"]}><Lines text={item.quote} /></p>')
    // Without lines, the quote is drawn exactly as before.
    expect(quote).toContain(': <p class:list={[quoteMark === \'marks\' && !quoted(item.quote) && "before:content-[open-quote] after:content-[close-quote]"]}>{item.quote}</p>}')
  })
})
