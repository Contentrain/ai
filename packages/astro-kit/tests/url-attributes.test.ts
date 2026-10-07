import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..', '..')

async function astroFiles(dir: string): Promise<string[]> {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry =>
    entry.isDirectory() ? astroFiles(join(dir, entry.name)) : Promise.resolve(entry.name.endsWith('.astro') ? [join(dir, entry.name)] : []),
  ))).flat()
}

/**
 * A site's addresses are content, so `javascript:` can arrive in any of them. Every URL attribute a kit component or
 * the starter prints (href, action, formaction, src, poster, data-embed-src on a native element or astro:assets'
 * `Image`) passes through `_shared/safe-url` (`safeHref`, `safeUrl`, `safeSrc`), or is one of the few built by the
 * code itself from a fixed scheme or a provider table (`mailto:${…}`, an embed provider's page): those are listed
 * here with the reason. A new attribute fails here until it uses the helper or is shown not to carry content.
 */
const ALLOWED = [
  'packages/astro-kit/components/_shared/KitImage.astro: src={local}', // the file's own metadata from import.meta.glob over public/, never an address
  'packages/astro-kit/components/embed/Embed.astro: href={target.href}', // embedTarget(): a provider's page, built from a fixed table
  'packages/astro-kit/components/embed/Embed.astro: data-embed-src={target.src}', // embedTarget(): the provider's player address, fixed table
  'packages/astro-kit/components/embed/Embed.astro: href={linkUrl}', // linkUrl is set only when the address starts with http(s)://
  'templates/astro-starter/src/components/SEO.astro: href={canonical}', // Astro.site + the page's path
  'templates/astro-starter/src/components/SEO.astro: href={feed}', // the site's feed path
]

const NATIVE = new Set(['a', 'area', 'audio', 'button', 'form', 'iframe', 'img', 'input', 'link', 'source', 'track', 'video', 'Image'])
const SAFE_CALL = /safe(?:Href|Url|Src)\(/
const ATTRIBUTE = /(?<![\w:-])(href|action|formaction|src|poster|data-embed-src)=\{/g

/** The text between the braces opened at `open`, honouring strings and template literals. */
function braced(source: string, open: number): string {
  let depth = 0
  let quote: string | undefined
  for (let at = open; at < source.length; at++) {
    const char = source[at]!
    if (quote) {
      if (char === '\\') at++
      else if (quote === '`' && char === '$' && source[at + 1] === '{') at = open + braced(source.slice(open), at - open + 1).length + (at - open) + 2
      else if (char === quote) quote = undefined
    }
    else if (char === '\'' || char === '"' || char === '`') quote = char
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return source.slice(open + 1, at)
  }
  throw new Error('unbalanced braces')
}

/** URL attributes in `source` that skip the helper and are not a fixed-scheme address; `name: expression` each. */
export function unsafeUrlAttributes(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(ATTRIBUTE)) {
    const expression = braced(source, match.index + match[0].length - 1).trim()
    const tag = [...source.slice(0, match.index).matchAll(/<([A-Za-z][\w.:-]*)/g)].at(-1)?.[1]
    if (!tag || !NATIVE.has(tag)) continue // a component's own prop: its markup is checked where it is written
    if (SAFE_CALL.test(expression)) continue
    if (/^`(?:tel|mailto):/.test(expression)) continue
    if (/^[A-Za-z_$][\w$]*$/.test(expression) && new RegExp(`(?:const|let)\\s+${expression.replace(/\$/g, '\\$')}\\s*=\\s*safe(?:Href|Url|Src)\\(`).test(source)) continue
    found.push(`${match[1]}={${expression}}`)
  }
  return found
}

describe('URL attributes in the kit and the starter', () => {
  it('all go through safe-url, except the listed ones built from a fixed scheme or table', async () => {
    // The starter's components/kit and the fixture's are exact copies of components/ (catalog.test.ts), so they are read once.
    const files = [
      ...await astroFiles(join(ROOT, 'packages', 'astro-kit', 'components')),
      ...(await astroFiles(join(ROOT, 'templates', 'astro-starter', 'src'))).filter(file => !file.includes(join('components', 'kit'))),
    ]
    const found: string[] = []
    for (const file of files) {
      for (const attribute of unsafeUrlAttributes(await readFile(file, 'utf8'))) found.push(`${relative(ROOT, file)}: ${attribute}`)
    }
    expect(found.toSorted()).toEqual(ALLOWED.toSorted())
  })

  describe('the guard itself', () => {
    it.each([
      ['<a href={item.href}>x</a>', ['href={item.href}']],
      ['<a href={`javascript:${x}`}>x</a>', ['href={`javascript:${x}`}']],
      ['<form method="post" action={form.action}></form>', ['action={form.action}']],
      ['<img src={image.src} alt="" />', ['src={image.src}']],
      ['<button formaction={target}>x</button>', ['formaction={target}']],
      ['<a href={cond ? item.href : "/"}>x</a>', ['href={cond ? item.href : "/"}']],
      ['<Image src={image.src} alt="" />', ['src={image.src}']],
      ['<video poster={poster}></video>', ['poster={poster}']],
    ])('flags %s', (source, expected) => {
      expect(unsafeUrlAttributes(source)).toEqual(expected)
    })

    it.each([
      '<a href={safeHref(item.href)}>x</a>',
      '<a href={`mailto:${email}`}>x</a>',
      '<a href={`tel:${phone}`}>x</a>',
      '<a href="/about/">x</a>',
      '<form action={safeUrl(form.action)}></form>',
      '<Button action={action} />',
      '<Slider href={item.href} />',
      'const url = safeSrc(given.src)\n<img src={url} alt="" />',
      '<a href={safeHref(`${base}/page/${n}`)}>x</a>',
    ])('accepts %s', (source) => {
      expect(unsafeUrlAttributes(source)).toEqual([])
    })

    it('does not accept a bare identifier that was never made safe', () => {
      expect(unsafeUrlAttributes('const url = given.src\n<img src={url} alt="" />')).toEqual(['src={url}'])
    })
  })
})
