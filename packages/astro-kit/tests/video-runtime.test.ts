// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { initBehaviors } from '../components/_shared/behaviors'
import { videoTarget } from '../components/_shared/embed-target'

/**
 * A source video player the engine kept as a poster link inside a behaviour island (`data-cr-video`, t5's island pass):
 * a link until a plain click, then the player, its address built from the checked provider and id. Run against the
 * real module, in a DOM.
 */

const island = (links: string, kind = 'anchor') => `<div data-cr-behavior="${kind}"><h2>Tour</h2>${links}</div>`
const link = (video: string, href = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ') => `<a href="${href}" target="_blank" rel="noopener noreferrer" data-cr-video="${video}"><img src="/p.svg" alt="" width="1200" height="800"><span>Studio tour</span></a>`

const click = (el: Element, init: MouseEventInit = {}): boolean => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }))

beforeEach(() => {
  // A test never reaches a provider: the DOM does not load what a frame points at.
  const dom = (window as unknown as { happyDOM?: { settings: { disableIframePageLoading: boolean, handleDisabledFileLoadingAsSuccess: boolean } } }).happyDOM
  if (dom) Object.assign(dom.settings, { disableIframePageLoading: true, handleDisabledFileLoadingAsSuccess: true })
  document.body.innerHTML = ''
})

describe('videoTarget', () => {
  it('reads `youtube:<id>` and `vimeo:<id>` as the same players as their pages', () => {
    expect(videoTarget('youtube:aqz-KE-bpKQ')?.src).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&rel=0')
    expect(videoTarget('youtube:aqz-KE-bpKQ')?.href).toBe('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
    expect(videoTarget('vimeo:76979871')?.src).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1')
    expect(videoTarget('https://youtu.be/aqz-KE-bpKQ')?.provider).toBe('youtube')
  })

  it('gives nothing for a bad id, another provider, a map or a widget', () => {
    for (const value of ['youtube:abc', 'youtube:aqz-KE-bpKQ"><script>', 'vimeo:abc', 'dailymotion:x7tgad0', 'javascript:alert(1)', 'https://evil.example/watch?v=aqz-KE-bpKQ', 'https://www.google.com/maps/embed?pb=1', 'https://calendly.com/acme', '', undefined])
      expect(videoTarget(value), String(value)).toBeNull()
  })
})

describe('a video link in a behaviour island', () => {
  it('loads nothing until a plain click, then plays from youtube-nocookie in the link\'s place, focused', () => {
    document.body.innerHTML = island(link('youtube:aqz-KE-bpKQ'))
    initBehaviors()
    expect(document.querySelector('iframe')).toBeNull()
    const a = document.querySelector('a[data-cr-video]')!
    expect(click(a)).toBe(false)
    const frame = document.querySelector('iframe')!
    expect(frame.src).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&rel=0')
    expect(frame.title).toBe('Studio tour')
    expect(frame.allowFullscreen).toBe(true)
    expect(document.querySelector('a[data-cr-video]')).toBeNull()
    expect(document.activeElement).toBe(frame)
  })

  it('plays Vimeo with dnt, and builds the address from the attribute\'s id, never from the link\'s href', () => {
    document.body.innerHTML = island(link('vimeo:76979871', 'https://evil.example/player'))
    initBehaviors()
    click(document.querySelector('a[data-cr-video]')!)
    expect(document.querySelector('iframe')!.src).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1')
  })

  it('leaves the link as it is for a bad id, an unknown provider, or a modified click', () => {
    document.body.innerHTML = island(link('youtube:abc') + link('dailymotion:x7tgad0') + link('youtube:aqz-KE-bpKQ'))
    initBehaviors()
    const [bad, unknown, good] = document.querySelectorAll('a[data-cr-video]')
    expect(click(bad!)).toBe(true)
    expect(click(unknown!)).toBe(true)
    expect(click(good!, { metaKey: true })).toBe(true)
    expect(click(good!, { button: 1 })).toBe(true)
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelectorAll('a[data-cr-video]')).toHaveLength(3)
  })

  it('plays in an island of any kind; a link in a nested (spoofed) root or outside an island is never wired', () => {
    document.body.innerHTML = `${island(link('youtube:aqz-KE-bpKQ'), 'disclosure')}<div data-cr-behavior="anchor"><div data-cr-behavior="anchor">${link('youtube:aqz-KE-bpKQ')}</div></div>${link('youtube:aqz-KE-bpKQ')}`
    initBehaviors()
    const [wired, nested, outside] = document.querySelectorAll('a[data-cr-video]')
    expect(click(nested!)).toBe(true)
    expect(click(outside!)).toBe(true)
    expect(document.querySelector('iframe')).toBeNull()
    click(wired!)
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('is wired once: a second init adds no second handler', () => {
    document.body.innerHTML = island(link('youtube:aqz-KE-bpKQ'))
    initBehaviors()
    initBehaviors()
    click(document.querySelector('a[data-cr-video]')!)
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
  })
})

describe('a video poster', () => {
  it('is never on the provider\'s hosts: its thumbnail would be a request before the click', async () => {
    const { onVideoHost } = await import('../components/_shared/embed-target')
    for (const src of ['https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg', 'https://img.youtube.com/vi/aqz-KE-bpKQ/0.jpg', 'https://i.vimeocdn.com/video/1.jpg', 'https://yt3.ggpht.com/a.jpg', '//i.ytimg.com/vi/x/0.jpg'])
      expect(onVideoHost(src), src).toBe(true)
    for (const src of ['/media/poster.jpg', 'https://example.com/wp-content/uploads/tour.jpg', 'https://notyoutube.com.example/x.jpg', undefined])
      expect(onVideoHost(src), String(src)).toBe(false)
  })
})

describe('the island link carries no player before the click', () => {
  it('has no provider address in any src or srcset, only the link to the video page', () => {
    document.body.innerHTML = island(link('youtube:aqz-KE-bpKQ'))
    initBehaviors()
    const sources = [...document.querySelectorAll('[src], [srcset]')].flatMap(el => [el.getAttribute('src') ?? '', el.getAttribute('srcset') ?? ''])
    expect(sources.filter(src => /youtube|ytimg|vimeo/.test(src))).toEqual([])
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('never frames a javascript:, other-host or malformed value, whatever the href says', () => {
    // An address is never taken, even a known provider's: only `youtube:<id>` / `vimeo:<id>`, so no attribute text reaches the frame.
    for (const value of ['javascript:alert(1)', 'https://evil.example/embed/aqz-KE-bpKQ', 'https://www.loom.com/embed/abc?x=1', 'https://fast.wistia.net/embed/iframe/abc', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'youtube:../../evil', 'youtube:aqz-KE-bpKQ?x=1', 'youtube:aqz-KE-bpKQ#t=1', 'vimeo:76979871#x', 'vimeo:76979871/../x', 'youtube:']) {
      document.body.innerHTML = island(link(value, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'))
      initBehaviors()
      expect(click(document.querySelector('a[data-cr-video]')!), value).toBe(true)
      expect(document.querySelector('iframe'), value).toBeNull()
    }
  })
})
