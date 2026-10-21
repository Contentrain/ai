// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initBehaviors } from '../components/_shared/behaviors'

/**
 * A carousel island does not loop (owl's own default, `loop: false`): Previous is off on the first slide and Next on the
 * last. Before, both were always on, so Previous on the first slide did nothing (x08's G-interaction failed on it). Run
 * against the module itself, in a DOM; happy-dom has no layout, so the track's sizes and its scroll are stubbed.
 */

const SLIDER = '<div data-cr-behavior="carousel" data-cr-items=".slide"><div class="track"><div class="slide">One</div><div class="slide">Two</div><div class="slide">Three</div></div></div>'

/** The track three 300 px slides wide, scrolled by its buttons as a browser would. */
function layout(track: HTMLElement, width = 300): void {
  let left = 0
  Object.defineProperty(track, 'clientWidth', { configurable: true, get: () => width })
  Object.defineProperty(track, 'scrollWidth', { configurable: true, get: () => width * 3 })
  Object.defineProperty(track, 'scrollLeft', { configurable: true, get: () => left })
  track.scrollBy = ((options: ScrollToOptions) => {
    left = Math.max(0, Math.min(width * 2, left + (options.left ?? 0)))
    track.dispatchEvent(new Event('scroll'))
  }) as typeof track.scrollBy
}

const track = () => document.querySelector<HTMLElement>('.track')!
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.cr-behavior-control')]
const state = () => buttons().map(button => [button.textContent, button.disabled, button.getAttribute('aria-disabled')])

beforeEach(() => {
  document.body.innerHTML = SLIDER
  vi.stubGlobal('ResizeObserver', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('carousel ends (behaviors.ts carousel)', () => {
  it('on the first slide Previous is off, on the last Next is off, in between both are on', () => {
    layout(track())
    initBehaviors()
    expect(state()).toEqual([['Previous', true, 'true'], ['Next', false, 'false']])
    const [prev, next] = buttons()
    next!.click()
    expect(state()).toEqual([['Previous', false, 'false'], ['Next', false, 'false']])
    next!.click()
    expect(state()).toEqual([['Previous', false, 'false'], ['Next', true, 'true']])
    prev!.click()
    prev!.click()
    expect(state()).toEqual([['Previous', true, 'true'], ['Next', false, 'false']])
  })

  it('a swipe (the track scrolled without the buttons) moves the ends too', () => {
    layout(track())
    initBehaviors()
    track().scrollBy({ left: 600 })
    expect(state()).toEqual([['Previous', false, 'false'], ['Next', true, 'true']])
  })

  it('a track not laid out yet (in a closed tab) keeps both on; once it has a width the resize sets the ends', () => {
    const observed: Array<() => void> = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { observed.push(callback) }
      observe() {}
    })
    layout(track(), 0)
    initBehaviors()
    expect(state()).toEqual([['Previous', false, null], ['Next', false, null]])
    layout(track())
    for (const callback of observed) callback()
    expect(state()).toEqual([['Previous', true, 'true'], ['Next', false, 'false']])
  })
})
