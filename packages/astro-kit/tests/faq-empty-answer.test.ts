import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FAQ = join(import.meta.dirname, '..', 'components', 'faq', 'Faq.astro')

/** The component's own `plain` and `MEDIA`, run as written, so the test reads what the page does. */
async function answeredOf() {
  const source = await readFile(FAQ, 'utf8')
  // The type annotation is the only TypeScript on the line.
  const plain = /^const plain = (.+)$/m.exec(source)?.[1]?.replace('(html: string)', '(html)')
  const media = /^const MEDIA = (.+)$/m.exec(source)?.[1]
  expect(plain && media).toBeTruthy()
  // eslint-disable-next-line no-new-func
  const make = new Function(`const plain = ${plain}; const MEDIA = ${media}; return { plain, answered: html => plain(html) !== '' || MEDIA.test(html) }`)
  return make() as { plain: (html: string) => string, answered: (html: string) => boolean }
}

describe('a FAQ question whose answer is empty', () => {
  it('counts an answer as empty when stripping the markup leaves no text and it shows nothing', async () => {
    const { answered } = await answeredOf()
    for (const html of ['', ' ', '<p></p>', '<p>&nbsp;</p>', '<p>&#160;</p>', '<br>', '<div><p> </p><br /></div>', '<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->'])
      expect(answered(html), html).toBe(false)
    for (const html of ['<p>Yes.</p>', 'Yes', '<p><img src="/a.png" alt=""></p>', '<figure><video src="/a.mp4"></video></figure>', '<iframe src="https://example.com"></iframe>'])
      expect(answered(html), html).toBe(true)
  })

  it('draws the question alone in the item\'s style: no details, summary or marker', async () => {
    const source = await readFile(FAQ, 'utf8')
    expect(source).toContain('{items.map((item, i) => answered[i] ? (')
    const alone = /\) : \(\n([\s\S]+?)\n {8}\)\)\}/.exec(source)?.[1] ?? ''
    expect(alone).toContain('<div class={s.item({ class: itemClass })}>')
    expect(alone).toContain('<span class={s.question()}>{item.question}</span>')
    // The row keeps the summary's look; nothing about it says it can be pressed, and plain's disclosure triangle is gone.
    expect(alone).toContain("<div class={s.summary({ class: style === 'plain' ? 'block cursor-auto' : 'cursor-auto' })}>")
    for (const name of ['<details', '<summary', 's.marker', 's.answer', 'set:html']) expect(alone).not.toContain(name)
  })

  it('opens the first question that has an answer, and the others render as before', async () => {
    const source = await readFile(FAQ, 'utf8')
    expect(source).toContain('open={openFirst && i === firstAnswered}>')
    expect(source).toContain('const firstAnswered = answered.indexOf(true)')
  })

  it('leaves a question without answer text out of the FAQPage JSON-LD, and drops the block when none has one', async () => {
    const source = await readFile(FAQ, 'utf8')
    expect(source).toContain("const withText = items.filter(item => plain(item.answer) !== '')")
    expect(source).toContain('const structured = schema && withText.length > 0')
    expect(source).toContain('mainEntity: withText.map(item =>')
    // An image alone is an answer on the page, but has no text for acceptedAnswer.
    const { plain } = await answeredOf()
    expect(plain('<p><img src="/a.png" alt="A chart"></p>')).toBe('')
    expect(plain('<p>Two&nbsp;<b>weeks</b>.</p>')).toBe('Two weeks .')
  })
})
