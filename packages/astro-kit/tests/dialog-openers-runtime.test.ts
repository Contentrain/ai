// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initBehaviors } from '../components/_shared/behaviors'

/**
 * A source popup opened from the page's content (E2b, ORK 2026-10-10): the migrated Dialog is drawn over the page with
 * no button of its own (`triggerStyle: 'none'`) and opens from the content's link to `#<id>`, a `commandfor` button, or
 * an address ending in `#<id>`. And a source's own closed <dialog> inside a behaviour island opens from its opener
 * instead of staying hidden (t7 on #823). Run against the real scripts, in a DOM.
 */

const KIT = join(import.meta.dirname, '..')

/** Dialog.astro's own client script, as the browser gets it. */
async function dialogScript(): Promise<string> {
  const astro = await readFile(join(KIT, 'components/dialog/Dialog.astro'), 'utf8')
  const code = /<script>([\s\S]*?)<\/script>/.exec(astro)![1]!
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
}

/** The markup Dialog prints with `triggerStyle: 'none'`, and a page link to it in the content. */
const PAGE = `<main><p>Get our guide: <a id="opener" href="#signup">Sign Up Now</a></p></main>
<div data-kit-dialog="signup" data-kit-external data-cr-fact="interactive:popup:1"><dialog id="signup" aria-label="Sign Up Now"><div><h2>Sign up</h2><p>Join us.</p></div><form method="dialog"><button type="submit" aria-label="Close">x</button></form></dialog></div>`

function showModalSpy(): void {
  // happy-dom's <dialog> opens on showModal; spy keeps the call countable.
  for (const el of document.querySelectorAll('dialog')) {
    const dialog = el as HTMLDialogElement
    dialog.showModal = vi.fn(() => { dialog.setAttribute('open', '') })
    dialog.close = vi.fn(() => { dialog.removeAttribute('open') })
  }
}

beforeEach(() => {
  history.replaceState(null, '', '/')
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Dialog, triggerStyle none: opened from elsewhere on the page', () => {
  let script = ''
  beforeAll(async () => { script = await dialogScript() })
  // eslint-disable-next-line no-new-func -- the component's own script, read from its file
  const run = () => new Function(script)()

  it('prints no button and no section band of its own', async () => {
    const astro = await readFile(join(KIT, 'components/dialog/Dialog.astro'), 'utf8')
    expect(astro).toContain("const Frame = external ? Fragment : Section")
    expect(astro).toContain('{!external && <button')
    expect(astro).toContain('data-kit-external={external || undefined}')
  })

  it('a link to #<id> in the content opens it (no jump), and says it opens a dialog', () => {
    document.body.innerHTML = PAGE
    showModalSpy()
    run()
    const link = document.getElementById('opener') as HTMLAnchorElement
    expect(link.getAttribute('aria-haspopup')).toBe('dialog')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect((document.getElementById('signup') as HTMLDialogElement).showModal).toHaveBeenCalledTimes(1)
  })

  it('an address that arrives with #<id> opens it; another hash does not', () => {
    history.replaceState(null, '', '/#signup')
    document.body.innerHTML = PAGE
    showModalSpy()
    run()
    expect((document.getElementById('signup') as HTMLDialogElement).showModal).toHaveBeenCalledTimes(1)

    history.replaceState(null, '', '/#other')
    document.body.innerHTML = PAGE
    showModalSpy()
    run()
    expect((document.getElementById('signup') as HTMLDialogElement).showModal).not.toHaveBeenCalled()
  })

  it('a dialog with its own button (the default) is not opened by page links: only external ones listen', () => {
    document.body.innerHTML = PAGE.replace(' data-kit-external', '').replace('<dialog', '<button data-kit-dialog-open>Open</button><dialog')
    showModalSpy()
    run()
    document.getElementById('opener')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect((document.getElementById('signup') as HTMLDialogElement).showModal).not.toHaveBeenCalled()
  })
})

describe('behaviour island: the source\'s own closed <dialog>', () => {
  /** A tab island whose panel holds a popup button and its closed dialog (the island pass named the opener by aria-controls). */
  const ISLAND = '<div data-cr-behavior="tablist" data-cr-close="Close"><div role="tablist"></div><div><button id="open" aria-haspopup="dialog" aria-controls="i1-offer">See the offer</button><dialog id="i1-offer"><p>10% off</p></dialog></div></div>'

  it('its opener opens it as a modal, with a close button added; in an island of another kind too', () => {
    document.body.innerHTML = ISLAND
    showModalSpy()
    initBehaviors()
    const dialog = document.getElementById('i1-offer') as HTMLDialogElement
    document.getElementById('open')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(dialog.showModal).toHaveBeenCalledTimes(1)
    const close = dialog.querySelector<HTMLButtonElement>('.cr-behavior-control')!
    expect(close.textContent).toBe('Close')
    close.click()
    expect(dialog.close).toHaveBeenCalledTimes(1)
  })

  it('a dialog with its own close form gets no second close button; one inside another dialog is left alone', () => {
    document.body.innerHTML = ISLAND.replace('<p>10% off</p>', '<p>10% off</p><form method="dialog"><button>x</button></form>')
    initBehaviors()
    expect(document.querySelectorAll('#i1-offer .cr-behavior-control')).toHaveLength(0)

    document.body.innerHTML = '<div data-cr-behavior="dialog"><button id="open" aria-haspopup="dialog" aria-controls="inner">x</button><dialog id="outer"><dialog id="inner"><p>y</p></dialog></dialog></div>'
    showModalSpy()
    initBehaviors()
    document.getElementById('open')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect((document.getElementById('inner') as HTMLDialogElement).showModal).not.toHaveBeenCalled()
  })

  it('without scripting its content is shown in place (the component\'s noscript sheet)', async () => {
    const astro = await readFile(join(KIT, 'components/behavior/Behavior.astro'), 'utf8')
    expect(astro).toContain(".cr-behavior dialog:not([open]){display:block")
    expect(astro).toContain('<noscript set:html={NOSCRIPT} />')
  })
})
