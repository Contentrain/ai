// Behavior islands: the source site's own markup for a widget no kit component carries (a slider, tabs, an
// accordion, a counter, a filter, an image lightbox), kept as content and made to work again by this one small module. The markup is
// the content; the behavior is ours: no source library, no jQuery, nothing the source shipped runs.
//
// Each island is a root the Behavior component prints: `data-cr-behavior` names the kind, and the item, title and
// panel selectors come from the engine (`data-cr-items`, `data-cr-title`, `data-cr-panel`), never from the source
// (the writer strips every `data-cr-*` the source markup carried before it wraps it). The module reads only ARIA,
// `details`, `hidden` and those attributes.
//
// Rules (t13's PR-E checklist §4): text goes in through `textContent` only, never `innerHTML` or its family; no
// `eval`, `Function`, `fetch` or `location`; every selector is scoped to its island root and run in try/catch (a
// selector the browser refuses leaves that island static); `init` is idempotent; anything that fails leaves the
// island as it was printed: readable, every item in reading order. Reduced motion is honoured.

type Kind = 'disclosure' | 'tablist' | 'carousel' | 'dialog' | 'countup' | 'toggle' | 'filter' | 'anchor' | 'lightbox'

const KINDS: ReadonlySet<string> = new Set<Kind>(['disclosure', 'tablist', 'carousel', 'dialog', 'countup', 'toggle', 'filter', 'anchor', 'lightbox'])
/** Past this many items an island wires the first ones; the rest stay visible as printed (said on the receipt). */
const MAX_ITEMS = 50

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Elements under the island root for a selector the engine wrote; nothing (never a throw) for a bad selector. */
function within(root: HTMLElement, selector: string | undefined): HTMLElement[] {
  if (!selector) return []
  try { return [...root.querySelectorAll<HTMLElement>(selector)].slice(0, MAX_ITEMS) }
  catch { return [] }
}

/** The element an `aria-controls` / `href="#…"` names, looked up inside the island only (ids are island-prefixed). */
function target(root: HTMLElement, id: string | null): HTMLElement | null {
  if (!id) return null
  try { return root.querySelector<HTMLElement>(`#${CSS.escape(id.replace(/^#/, ''))}`) }
  catch { return null }
}

function disclosure(root: HTMLElement): void {
  for (const button of within(root, 'button[aria-expanded][aria-controls], [role="button"][aria-expanded][aria-controls]')) {
    const panel = target(root, button.getAttribute('aria-controls'))
    if (!panel) continue
    const set = (open: boolean) => { button.setAttribute('aria-expanded', String(open)); panel.hidden = !open }
    set(button.getAttribute('aria-expanded') === 'true')
    button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'))
  }
  // `details`/`summary` already open and close in the browser.
}

function tablist(root: HTMLElement): void {
  const tabs = within(root, root.dataset.crTitle ?? '[role="tab"]')
  const panels = tabs.map(tab => target(root, tab.getAttribute('aria-controls')))
  const fallback = within(root, root.dataset.crPanel)
  const panelOf = (i: number): HTMLElement | null => panels[i] ?? fallback[i] ?? null
  if (tabs.length < 2 || tabs.some((_, i) => !panelOf(i))) return
  const select = (index: number, focus = false) => {
    tabs.forEach((tab, i) => {
      const on = i === index
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      panelOf(i)!.hidden = !on
    })
    if (focus) tabs[index]!.focus()
  }
  const first = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'))
  select(first)
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', (event) => { event.preventDefault(); select(i) })
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
      if (step) { event.preventDefault(); select((i + step + tabs.length) % tabs.length, true) }
      else if (event.key === 'Home') { event.preventDefault(); select(0, true) }
      else if (event.key === 'End') { event.preventDefault(); select(tabs.length - 1, true) }
    })
  })
}

function control(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.className = 'cr-behavior-control'
  button.addEventListener('click', onClick)
  return button
}

function carousel(root: HTMLElement): void {
  const items = within(root, root.dataset.crItems)
  const track = items[0]?.parentElement
  // Past MAX_ITEMS (or other children in the track) the carousel stays static: never squeeze unwired slides into the row.
  if (items.length < 2 || !track || !items.every(item => item.parentElement === track) || track.children.length !== items.length) return
  // A scroll-snap track: the browser moves it (swipe, keys, scroll); the buttons only scroll it. No timer: a slider
  // that advanced by itself on the old site waits for the visitor here (said on the receipt).
  Object.assign(track.style, { display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollBehavior: reduced() ? 'auto' : 'smooth' })
  for (const item of items) Object.assign(item.style, { flex: '0 0 100%', scrollSnapAlign: 'start' })
  track.setAttribute('tabindex', '0')
  const go = (step: number) => track.scrollBy({ left: step * track.clientWidth })
  const bar = document.createElement('div')
  bar.className = 'cr-behavior-controls'
  bar.append(control(root.dataset.crPrev ?? 'Previous', () => go(-1)), control(root.dataset.crNext ?? 'Next', () => go(1)))
  track.after(bar)
}

function dialog(root: HTMLElement): void {
  for (const opener of within(root, '[aria-haspopup="dialog"][aria-controls]')) {
    const content = target(root, opener.getAttribute('aria-controls'))
    if (!content || content.closest('dialog')) continue
    const box = document.createElement('dialog')
    box.className = 'cr-behavior-dialog'
    content.before(box)
    box.append(content)
    content.hidden = false
    box.append(control(root.dataset.crClose ?? 'Close', () => box.close()))
    opener.addEventListener('click', (event) => { event.preventDefault(); box.showModal() })
    box.addEventListener('click', (event) => { if (event.target === box) box.close() })
  }
}

/** The first text node under `item` holding a number: the digits a counter shows, beside its icon or suffix spans. */
function digitsOf(item: HTMLElement): { node: Text, digits: string } | null {
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const match = /\d[\d.,]*/.exec(node.data)
    if (match) return { node, digits: match[0] }
  }
  return null
}

function countup(root: HTMLElement): void {
  const items = within(root, root.dataset.crItems)
  if (reduced() || typeof IntersectionObserver !== 'function') return
  for (const item of items) {
    const found = digitsOf(item)
    if (!found) continue
    const { node, digits } = found
    const text = node.data
    const end = Number(digits.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
    if (!Number.isFinite(end) || end <= 0) continue
    const fraction = digits.split(/[.,]/)[1] ?? ''
    const decimals = fraction.length > 2 ? 0 : fraction.length
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some(e => e.isIntersecting)) return
      seen.disconnect()
      const start = performance.now()
      // Only the digits' own text node changes: an icon, a unit or a suffix span beside it stays as printed.
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1200)
        node.data = text.replace(digits, t < 1 ? (end * t).toFixed(decimals) : digits)
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    seen.observe(item)
  }
}

function toggle(root: HTMLElement): void {
  for (const button of within(root, 'button[aria-pressed][aria-controls]')) {
    const panel = target(root, button.getAttribute('aria-controls'))
    if (!panel) continue
    const set = (on: boolean) => { button.setAttribute('aria-pressed', String(on)); panel.hidden = !on }
    set(button.getAttribute('aria-pressed') === 'true')
    button.addEventListener('click', () => set(button.getAttribute('aria-pressed') !== 'true'))
  }
}

/** What an item is filed under: its classes and its `data-category` / `data-filter` words. */
const tokens = (el: HTMLElement): string[] => `${el.className} ${el.dataset.category ?? ''} ${el.dataset.filter ?? ''}`.split(/[\s,]+/).filter(Boolean)

function filter(root: HTMLElement): void {
  const items = within(root, root.dataset.crItems)
  const buttons = within(root, '[data-filter]')
  if (!items.length || !buttons.length) return
  for (const button of buttons) {
    button.addEventListener('click', (event) => {
      event.preventDefault()
      const want = (button.dataset.filter ?? '').replace(/^\./, '')
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button))
      for (const item of items) item.hidden = !(want === '' || want === '*' || want === 'all' || tokens(item).includes(want))
    })
  }
}

function anchor(root: HTMLElement): void {
  for (const link of within(root, 'a[href^="#"]')) {
    // The island's own (prefixed) target first; the page's only when the island has none.
    const id = link.getAttribute('href')!.slice(1)
    const to = target(root, id) ?? (id ? document.getElementById(id) : null)
    if (!to) continue
    link.addEventListener('click', (event) => { event.preventDefault(); to.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }) })
  }
}

/** A link to an image file, as a source lightbox wrapped one (`a[href$=.jpg] > img`): http(s) or same-site only. */
function imageHref(link: HTMLAnchorElement): string | null {
  let url: URL
  try { url = new URL(link.getAttribute('href') ?? '', document.baseURI) }
  catch { return null }
  return (url.protocol === 'https:' || url.protocol === 'http:') && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname) ? url.href : null
}

function lightbox(root: HTMLElement): void {
  let box: HTMLDialogElement | null = null
  let image: HTMLImageElement | null = null
  for (const link of within(root, 'a[href]') as HTMLAnchorElement[]) {
    const thumb = link.querySelector('img')
    const href = thumb ? imageHref(link) : null
    if (!thumb || !href) continue
    link.addEventListener('click', (event) => {
      event.preventDefault()
      if (!box || !image) {
        box = document.createElement('dialog')
        box.className = 'cr-behavior-dialog cr-behavior-lightbox'
        image = document.createElement('img')
        box.append(image, control(root.dataset.crClose ?? 'Close', () => box!.close()))
        box.addEventListener('click', (e) => { if (e.target === box) box!.close() })
        root.append(box)
      }
      image.src = href
      image.alt = thumb.alt
      box.showModal()
    })
  }
}

const WIRE: Record<Kind, (root: HTMLElement) => void> = { disclosure, tablist, carousel, dialog, countup, toggle, filter, anchor, lightbox }

/** Wires every island on the page once. Safe to call again (a view transition, a second script copy). */
export function initBehaviors(scope: ParentNode = document): void {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-cr-behavior]')) {
    const kind = root.dataset.crBehavior ?? ''
    // A root inside another root is not ours: the component prints one root per island, so a nested one came with the
    // markup (a spoofed island the writer's pass would strip). Never wired, so its selectors never run.
    if (root.dataset.crReady !== undefined || !KINDS.has(kind) || root.parentElement?.closest('[data-cr-behavior]')) continue
    try {
      WIRE[kind as Kind](root)
      root.dataset.crReady = ''
    }
    catch {
      // Left as printed: the content is all there, it just does not move.
    }
  }
}
