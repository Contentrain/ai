import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const EMBED = join(import.meta.dirname, '..', 'components', 'embed', 'Embed.astro')

/** The component's own YouTube id pattern, run as written. */
async function youtubeIdOf() {
  const source = await readFile(EMBED, 'utf8')
  const pattern = /^const youtubeId = .+? \? (\/.+\/)\.exec\(target\.href\)/m.exec(source)?.[1]
  expect(pattern).toBeTruthy()
  // eslint-disable-next-line no-new-func
  const re = new Function(`return ${pattern}`)() as RegExp
  return (href: string) => re.exec(href)?.[1]
}

describe('an Embed\'s VideoObject JSON-LD', () => {
  it('is printed only when asked, for a video that has a name', async () => {
    const source = await readFile(EMBED, 'utf8')
    expect(source).toContain('schema = false')
    expect(source).toContain("const structured = schema && target?.kind === 'video' && name")
    expect(source).toContain('{structured && <script type="application/ld+json" set:html={structured}></script>}')
  })

  it('states only what the embed knows: the caption as description, the upload date only when given', async () => {
    const source = await readFile(EMBED, 'utf8')
    expect(source).toContain("...(caption && caption !== name ? { description: caption } : {})")
    expect(source).toContain('...(uploaded ? { uploadDate: uploaded } : {})')
    expect(source).toContain('...(thumbnail ? { thumbnailUrl: thumbnail } : {})')
    // The player address without its query (autoplay, nocookie flags), and no closing tag can leave the script.
    expect(source).toContain("embedUrl: target.src.split('?')[0]")
    expect(source).toContain(".replace(/</g, '\\\\u003c')")
  })

  it('takes the local poster as thumbnail, else the YouTube still of the watch or shorts page', async () => {
    const source = await readFile(EMBED, 'utf8')
    expect(source).toContain('const thumbnail = poster?.src ? new URL(poster.src, Astro.site ?? Astro.url).href : youtubeId ?')
    const id = await youtubeIdOf()
    expect(id('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(id('https://www.youtube.com/watch?t=10&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(id('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk')
    expect(id('https://www.youtube.com/channel/UCabc')).toBeUndefined()
  })
})
