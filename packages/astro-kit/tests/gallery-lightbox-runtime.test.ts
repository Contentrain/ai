// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A Gallery with `open: 'lightbox'` (M-5, ORK 2026-10-16): each tile a link to its large file, one modal viewer for the
 * set that steps with buttons and keys, and nothing of it on a gallery that does not ask for it. Run against the
 * viewer's own script, as the browser gets it, in a DOM.
 */

const KIT = join(import.meta.dirname, '..')
const read = (file: string) => readFile(join(KIT, 'components/gallery', file), 'utf8')

async function viewerScript(): Promise<string> {
  const code = /<script>([\s\S]*?)<\/script>/.exec(await read('GalleryLightbox.astro'))![1]!
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
}

const tile = (n: number, caption?: string, href = `/media/photo-${n}-full.jpg`) =>
  `<li><figure><a href="${href}" aria-label="Enlarge: Photo ${n}" data-kit-lightbox-item${caption ? ` data-caption="${caption}"` : ''}><img src="/media/photo-${n}.jpg" alt="Photo ${n}"></a></figure></li>`

/** The markup Gallery and GalleryLightbox print, trimmed to what the script reads. */
const page = (tiles: string, single = false) => `<section id="coast"><div data-kit-lightbox="coast-viewer"><ul role="list">${tiles}</ul>
<dialog id="coast-viewer" aria-label="Along the coast" data-of="of">
  <div><button type="button" data-kit-lightbox-close>Close</button></div>
  <div>${single ? '<span></span>' : '<button type="button" aria-label="Previous image" data-kit-lightbox-prev></button>'}<img alt="" data-kit-lightbox-image hidden>${single ? '<span></span>' : '<button type="button" aria-label="Next image" data-kit-lightbox-next></button>'}</div>
  <p aria-live="polite"><span data-kit-lightbox-caption></span>${single ? '' : '<span data-kit-lightbox-count></span>'}</p>
</dialog></div></section>`

const FOUR = page(tile(1, 'Porto at dawn') + tile(2, 'Train to Coimbra') + tile(3) + tile(4, 'Harbour'))

/** A tile's large file, as the link resolves it. */
const full = (n: number) => new URL(`/media/photo-${n}-full.jpg`, location.href).href
const dialog = () => document.querySelector('dialog')!
const image = () => document.querySelector<HTMLImageElement>('[data-kit-lightbox-image]')!
const caption = () => document.querySelector('[data-kit-lightbox-caption]')!.textContent
const count = () => document.querySelector('[data-kit-lightbox-count]')?.textContent
const links = () => [...document.querySelectorAll<HTMLAnchorElement>('a[data-kit-lightbox-item]')]
const key = (name: string) => dialog().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))

function modalSpy(): void {
  const box = dialog()
  box.showModal = vi.fn(() => { box.setAttribute('open', '') })
  box.close = vi.fn(() => { box.removeAttribute('open'); box.dispatchEvent(new Event('close')) })
}

let script = ''
beforeAll(async () => { script = await viewerScript() })
// eslint-disable-next-line no-new-func -- the component's own script, read from its file
const run = () => new Function(script)()

beforeEach(() => { document.body.innerHTML = FOUR; modalSpy() })
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('Gallery lightbox: one viewer for the set', () => {
  it('a plain click on a tile opens the viewer on that tile: its large file, its alt, its caption, its place in the set', () => {
    run()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    links()[1]!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(dialog().showModal).toHaveBeenCalledOnce()
    expect(image().src).toBe(full(2))
    expect(image().alt).toBe('Photo 2')
    expect(image().hidden).toBe(false)
    expect(caption()).toBe('Train to Coimbra')
    expect(count()).toBe('2 of 4')
  })

  it('previous and next, ←/→, Home and End step through the set and wrap at the ends; a tile with no caption shows none', () => {
    run()
    links()[0]!.click()
    document.querySelector<HTMLButtonElement>('[data-kit-lightbox-prev]')!.click()
    expect(count()).toBe('4 of 4')
    expect(caption()).toBe('Harbour')
    document.querySelector<HTMLButtonElement>('[data-kit-lightbox-next]')!.click()
    expect(count()).toBe('1 of 4')
    key('ArrowRight')
    key('ArrowRight')
    expect(count()).toBe('3 of 4')
    expect(caption()).toBe('')
    key('ArrowLeft')
    expect(count()).toBe('2 of 4')
    key('End')
    expect(image().src).toBe(full(4))
    key('Home')
    expect(count()).toBe('1 of 4')
    // The buttons are inside the viewer: stepping never closes it.
    expect(dialog().close).not.toHaveBeenCalled()
  })

  it('right to left, the arrows are mirrored', () => {
    run()
    dialog().style.direction = 'rtl'
    links()[0]!.click()
    key('ArrowLeft')
    expect(count()).toBe('2 of 4')
    key('ArrowRight')
    expect(count()).toBe('1 of 4')
  })

  it('closing (the button, or a click outside the image) hands focus back to the tile it was opened from', () => {
    run()
    links()[2]!.click()
    document.querySelector<HTMLButtonElement>('[data-kit-lightbox-close]')!.click()
    expect(dialog().close).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(links()[2])
    links()[3]!.click()
    image().click()
    expect(dialog().close).toHaveBeenCalledOnce()
    dialog().click()
    expect(dialog().close).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(links()[3])
  })

  it('a click asking for a new tab or window keeps the link: the viewer does not open', () => {
    run()
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
      links()[0]!.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(false)
    }
    expect(dialog().showModal).not.toHaveBeenCalled()
  })

  it('a caption goes in as text, never as markup', () => {
    document.body.innerHTML = page(tile(1, '&lt;img src=x onerror=alert(1)&gt;') + tile(2))
    modalSpy()
    run()
    links()[0]!.click()
    expect(caption()).toBe('<img src=x onerror=alert(1)>')
    expect(document.querySelector('[data-kit-lightbox-caption] img')).toBeNull()
  })

  it('a tile whose address the kit refused (`#`) stays a plain link, left out of the set', () => {
    document.body.innerHTML = page(tile(1) + tile(2, undefined, '#') + tile(3))
    modalSpy()
    run()
    links()[0]!.click()
    key('ArrowRight')
    expect(image().src).toBe(full(3))
    expect(count()).toBe('2 of 2')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    links()[1]!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })

  it('two tiles, one refused: one image left, so the step buttons are hidden (keeping their place) and so is the counter', () => {
    document.body.innerHTML = page(tile(1, 'Porto at dawn') + tile(2, undefined, '#'))
    modalSpy()
    run()
    links()[0]!.click()
    for (const name of ['prev', 'next']) expect(document.querySelector<HTMLElement>(`[data-kit-lightbox-${name}]`)!.style.visibility).toBe('hidden')
    expect(document.querySelector<HTMLElement>('[data-kit-lightbox-count]')!.hidden).toBe(true)
    key('ArrowRight')
    expect(image().src).toBe(full(1))
    expect(caption()).toBe('Porto at dawn')
  })

  it('one image: no counter, and the keys do nothing', () => {
    document.body.innerHTML = page(tile(1, 'Porto at dawn'), true)
    modalSpy()
    run()
    links()[0]!.click()
    expect(caption()).toBe('Porto at dawn')
    expect(count()).toBeUndefined()
    key('ArrowRight')
    expect(image().src).toBe(full(1))
  })

  it('is wired once, however often the script runs (a second copy, a client-router page load)', () => {
    run()
    run()
    document.dispatchEvent(new Event('astro:page-load'))
    links()[0]!.click()
    document.querySelector<HTMLButtonElement>('[data-kit-lightbox-next]')!.click()
    expect(count()).toBe('2 of 4')
    expect(dialog().showModal).toHaveBeenCalledOnce()
  })
})

describe('Gallery lightbox: in the markup', () => {
  it('without the option, Gallery prints no viewer, no data-kit-lightbox and no script: it renders GalleryLightbox only then', async () => {
    const gallery = await read('Gallery.astro')
    expect(gallery).not.toContain('<script')
    expect(gallery).toContain("const lightbox = open === 'lightbox' ? `${id}-viewer` : undefined")
    expect(gallery).toContain('data-kit-lightbox={lightbox}>')
    expect(gallery).toContain('{lightbox && <GalleryLightbox ')
  })

  it('each tile is a real link to its large file (the full image, else the image), named "Enlarge: …"', async () => {
    const gallery = await read('Gallery.astro')
    expect(gallery).toContain("<a href={safeHref((item.full ?? item.image).src)} class={s.frame()} aria-label={`${enlargeLabel}: ${item.image.alt || item.caption || ''}`.trim()} data-kit-lightbox-item")
  })

  it('the viewer is a modal dialog named by the gallery, its buttons named from props, the counter and caption announced', async () => {
    const viewer = await read('GalleryLightbox.astro')
    expect(viewer).toContain('<dialog id={id} aria-label={label} data-of={ofLabel}')
    expect(viewer).toContain('aria-label={prevLabel} data-kit-lightbox-prev')
    expect(viewer).toContain('aria-label={nextLabel} data-kit-lightbox-next')
    expect(viewer).toContain('data-kit-lightbox-close>{closeLabel}</button>')
    expect(viewer).toContain('aria-live="polite"')
    expect(viewer).toContain('dialog.showModal()')
    // Text only, never markup; no animation to turn off under reduced motion.
    expect(viewer).not.toMatch(/innerHTML|insertAdjacentHTML|transition|\.animate\(|@keyframes/)
  })
})
