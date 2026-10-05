import { describe, it, expect } from 'vitest'
import type { RawIR } from '@contentrain/types'
import { parseWxr, rawToContentrain, hexId } from './index'
import { decodeEntities, strip } from './core'
import { FIXTURE } from './wxr.test'

// A plain-text field is escaped once where it is printed (Astro's text escaping); a
// reference left in it prints as `&amp;hellip;` in og:description and on list cards.
describe('strip decodes character references once', () => {
  it('named, decimal and hex forms of the same character agree', () => {
    expect(strip('[&hellip;]')).toBe('[…]')
    expect(strip('[&#8230;]')).toBe('[…]')
    expect(strip('It&#8217;s')).toBe('It’s')
    // A tag cut short at the end goes; text with a less-than sign stays (formchickens' Wikimedia captions, B69).
    expect(strip('Karadeniz kökenli Gerze horozu. Fotoğraf: <a href="//commons.wikimedia.org/w/index.php?title=User:X&action=edit&redlink=1" class="new" title, CC BY-SA 4.0 (Wikimedia Commons)')).toBe('Karadeniz kökenli Gerze horozu. Fotoğraf:')
    expect(strip('a < b and 1<2')).toBe('a < b and 1<2')
    expect(strip('<p>Whole <b>tag</b></p>')).toBe('Whole tag')
    expect(strip('It&#x2019;s')).toBe('It’s')
    expect(strip('It&rsquo;s')).toBe('It’s')
    expect(strip('&ldquo;Q&rdquo; &lsquo;q&rsquo; a&mdash;b a&ndash;b')).toBe('“Q” ‘q’ a—b a–b')
    expect(strip('Fish &amp; chips')).toBe('Fish & chips')
    expect(strip('a&nbsp;b')).toBe('a b')
    expect(strip('&quot;x&quot; &apos;y&apos;')).toBe('"x" \'y\'')
  })

  it('decodes in one pass: an escaped reference stays a reference', () => {
    expect(strip('&amp;lt;')).toBe('&lt;')
    expect(strip('&amp;hellip;')).toBe('&hellip;')
    expect(strip('&amp;amp;')).toBe('&amp;')
  })

  it('takes tags out before decoding, so escaped markup survives as text — it is escaped again where printed', () => {
    expect(strip('<p>Use &lt;b&gt; for bold</p>')).toBe('Use <b> for bold')
    expect(strip('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>')
  })

  it('leaves an unknown name, a bare ampersand and an out-of-range code point as they are', () => {
    expect(decodeEntities('&copy2; &bogus; R&D &#1114112; &#xD800;')).toBe('&copy2; &bogus; R&D &#1114112; \uD800')
    expect(strip('&HELLIP;')).toBe('…')
  })
})

describe('rawToContentrain plain-text fields', () => {
  it('writes an excerpt and a title with their references decoded', async () => {
    const { raw: base } = await parseWxr(FIXTURE)
    const hello = base.posts.find((p) => p.slug === 'hello-world')!
    const raw: RawIR = {
      ...base,
      posts: [...base.posts, { ...hello, id: 50, slug: 'entities', title: 'Fish &amp; chips&#8230;', excerpt: '<p>It&#8217;s here [&hellip;]</p>' }],
    }
    const { files } = rawToContentrain(raw, { updatedBy: 'test' })
    const entry = JSON.parse(files['.contentrain/content/blog/posts/data.json']!)[hexId('posts:entities')]
    expect(entry.title).toBe('Fish & chips…')
    expect(entry.excerpt).toBe('It’s here […]')
  })
})
