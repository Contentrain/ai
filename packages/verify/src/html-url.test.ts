import { describe, it, expect } from 'vitest'
import {
  anchors, attr, head, images, jsonLd, jsonLdTypes, links, linksRel, metaMap,
  sitemapLocations, text, titles,
} from './html'
import { identity, isInternal, resolve } from './url'

describe('head/attr extraction', () => {
  it('splits on the first </head> and yields nothing without one', () => {
    expect(head('<head><title>A</title></head><body>x</body>')).toContain('<title>A</title>')
    expect(head('<body>no head here</body>')).toBe('')
  })

  it('reads double-quoted, single-quoted and unquoted attributes', () => {
    expect(attr('<link rel="canonical" href="/a">', 'href')).toBe('/a')
    expect(attr("<link rel='canonical' href='/a'>", 'href')).toBe('/a')
    expect(attr('<link rel=canonical href=/a>', 'href')).toBe('/a')
    expect(attr('<link rel="canonical">', 'href')).toBeUndefined()
  })

  it('decodes the entities that actually appear in attributes', () => {
    expect(attr('<a href="/a?x=1&amp;y=2">', 'href')).toBe('/a?x=1&y=2')
    expect(titles('<head><title>Tom &amp; Jerry</title></head>')[0]).toBe('Tom & Jerry')
  })

  it('does not confuse an attribute with one whose name it is a suffix of', () => {
    // `-` is not a word character, so a `\b` anchor matches inside `data-href`.
    // Lazy-loading themes put the real URL in `data-src` and a placeholder in
    // `src` on almost every image, so this is the common case, not the corner.
    expect(attr('<a data-href="/wrong" href="/right">', 'href')).toBe('/right')
    expect(attr('<img data-src="/real.png" src="/placeholder.png">', 'src')).toBe('/placeholder.png')
    expect(attr('<img data-src="/real.png">', 'src')).toBeUndefined()
  })
})

describe('titles', () => {
  it('ignores a <title> inside an inline svg', () => {
    const html = '<head><title>Real</title><svg><title>Icon label</title></svg></head>'
    expect(titles(html)).toEqual(['Real'])
  })

  it('reports a genuine duplicate', () => {
    expect(titles('<head><title>A</title><title>B</title></head>')).toEqual(['A', 'B'])
  })

  it('finds nothing in the body', () => {
    expect(titles('<head></head><body><title>Not the page title</title></body>')).toEqual([])
  })
})

describe('meta and link tags', () => {
  const html = `<head>
    <meta name="description" content="D">
    <meta property="og:title" content="T">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="/a">
    <link rel="alternate" hreflang="tr" href="/tr/a">
    <link rel="alternate" type="application/rss+xml" href="/feed">
    <link rel="stylesheet" href="/a.css">
  </head>`

  it('keys meta by name or property, lowercased', () => {
    const meta = metaMap(html)
    expect(meta.get('description')).toEqual(['D'])
    expect(meta.get('og:title')).toEqual(['T'])
    expect(meta.get('robots')).toEqual(['index, follow'])
  })

  it('reads links with their rel lowercased and filters by token', () => {
    expect(links(html)).toHaveLength(4)
    expect(linksRel(html, 'canonical').map(l => l.href)).toEqual(['/a'])
    expect(linksRel(html, 'alternate')).toHaveLength(2)
  })

  it('matches a rel token inside a multi-token rel', () => {
    expect(linksRel('<head><link rel="shortlink canonical" href="/a"></head>', 'canonical')).toHaveLength(1)
    // …and not a token it is merely a prefix of.
    expect(linksRel('<head><link rel="canonical-ish" href="/a"></head>', 'canonical')).toHaveLength(0)
  })
})

describe('json-ld', () => {
  it('parses blocks and reports the ones that do not parse', () => {
    const blocks = jsonLd('<script type="application/ld+json">{"@type":"Article"}</script><script type="application/ld+json">{oops</script>')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.value).toEqual({ '@type': 'Article' })
    expect(blocks[1]!.value).toBeUndefined()
  })

  it('reads types out of an @graph, which is how themes ship them', () => {
    const value = { '@graph': [{ '@type': 'Organization' }, { '@type': ['WebSite', 'Thing'] }] }
    expect(jsonLdTypes(value).toSorted()).toEqual(['Organization', 'Thing', 'WebSite'])
  })
})

describe('body scanning', () => {
  const html = '<head><link rel="canonical" href="/a"></head><body><a href="/x">x</a><img src="/i.png" alt="I"><img src="/j.png"></body>'

  it('reads anchors and images from the body only', () => {
    expect(anchors(html)).toEqual(['/x'])
    expect(images(html)).toEqual([{ src: '/i.png', alt: 'I' }, { src: '/j.png', alt: undefined }])
  })

  it('distinguishes alt="" from no alt at all', () => {
    expect(images('<body><img src="/a.png" alt=""></body>')[0]!.alt).toBe('')
    expect(images('<body><img src="/a.png"></body>')[0]!.alt).toBeUndefined()
  })

  it('strips script and style out of visible text', () => {
    expect(text('<body>Hello <script>var x = "not text"</script><style>.a{}</style> world</body>')).toBe('Hello world')
  })
})

describe('sitemap', () => {
  it('reads loc entries', () => {
    expect(sitemapLocations('<urlset><url><loc>https://e.com/a</loc></url><url><loc>https://e.com/b</loc></url></urlset>'))
      .toEqual(['https://e.com/a', 'https://e.com/b'])
  })
})

describe('url resolution', () => {
  it('resolves relative hrefs against the document', () => {
    expect(resolve('../b', '/a/c/', 'https://e.com')).toBe('https://e.com/a/b')
    expect(resolve('/b', 'https://e.com/a/', 'https://e.com')).toBe('https://e.com/b')
  })

  it('works without a site by resolving against a reserved origin', () => {
    expect(resolve('/b', '/a')).toBe('https://contentrain.invalid/b')
    expect(isInternal(resolve('/b', '/a')!)).toBe(true)
    expect(isInternal('https://elsewhere.example/b')).toBe(false)
  })

  it('treats only the site host as internal', () => {
    expect(isInternal('https://e.com/a', 'https://e.com')).toBe(true)
    expect(isInternal('https://cdn.e.com/a', 'https://e.com')).toBe(false)
    expect(isInternal('https://cdn.e.com/a', 'https://e.com', ['cdn.e.com'])).toBe(true)
  })

  it('is not fooled by a non-http scheme', () => {
    expect(isInternal('mailto:a@e.com', 'https://e.com')).toBe(false)
    expect(isInternal('javascript:void(0)', 'https://e.com')).toBe(false)
  })
})

describe('document identity', () => {
  it('collapses the three spellings of one address', () => {
    for (const spelling of ['/about', '/about/', '/about/index.html', 'https://e.com/about/']) {
      expect(identity(spelling, 'https://e.com'), spelling).toBe('/about')
    }
  })

  it('keeps the root as /', () => {
    for (const spelling of ['/', '/index.html', 'https://e.com/']) {
      expect(identity(spelling, 'https://e.com'), spelling).toBe('/')
    }
  })

  it('drops query and fragment, which are not part of a document', () => {
    expect(identity('/a?utm=x#top', 'https://e.com')).toBe('/a')
  })

  it('preserves case, because static hosts do', () => {
    expect(identity('/About', 'https://e.com')).toBe('/About')
  })
})
