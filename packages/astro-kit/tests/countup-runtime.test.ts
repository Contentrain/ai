// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initBehaviors } from '../components/_shared/behaviors'

/**
 * A Stats section with `motion: 'count'` is a count-up island (ORK's three conditions, 2026-10-10): (a) nothing moves
 * under reduced motion, (b) the final number is in the HTML before any script runs, (c) the count starts only when the
 * figure scrolls into view (IntersectionObserver). Run against the module itself, in a DOM.
 */

/** The markup Stats prints for one figure with `motion: 'count'`: the digits in their own span, prefix and suffix beside. */
const STATS = '<dl data-cr-behavior="countup" data-cr-items="[data-kit-count]"><div><dt>Shops launched</dt><dd>$<span data-kit-count>1,200</span>+</dd></div><div><dt>Uptime</dt><dd><span data-kit-count>99.9</span>%</dd></div></dl>'

let observers: Array<{ callback: IntersectionObserverCallback, targets: Element[] }> = []
let frames: FrameRequestCallback[] = []
let clock = 0

/** Runs the queued animation frames at `ms` after the start. */
function frameAt(ms: number): void {
  clock = ms
  const queued = frames
  frames = []
  for (const frame of queued) frame(ms)
}

/** Every observed figure scrolls into view. */
function intersect(): void {
  for (const o of observers) o.callback(o.targets.map(target => ({ isIntersecting: true, target }) as IntersectionObserverEntry), {} as IntersectionObserver)
}

const figures = () => [...document.querySelectorAll('[data-kit-count]')].map(el => el.parentElement!.textContent)

function stubs(options: { reduced?: boolean, observer?: boolean } = {}): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: options.reduced === true && query.includes('reduce') }) as MediaQueryList)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  if (options.observer === false) vi.stubGlobal('IntersectionObserver', undefined)
  else {
    vi.stubGlobal('IntersectionObserver', class {
      readonly entry: { callback: IntersectionObserverCallback, targets: Element[] }
      constructor(callback: IntersectionObserverCallback) { this.entry = { callback, targets: [] }; observers.push(this.entry) }
      observe(target: Element) { this.entry.targets.push(target) }
      disconnect() { this.entry.targets = [] }
    })
  }
}

beforeEach(() => {
  observers = []
  frames = []
  clock = 0
  document.body.innerHTML = STATS
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Stats count-up (behaviors.ts countup)', () => {
  it('(b) the final numbers are what the page prints, before and without the script', async () => {
    expect(figures()).toEqual(['$1,200+', '99.9%'])
    // Stats prints the value itself in the figure's span: the final number, never a 0 to count from.
    const astro = await readFile(join(import.meta.dirname, '../components/stats/Stats.astro'), 'utf8')
    expect(astro.match(/<span data-kit-count>\{item\.value\}<\/span>/g)).toHaveLength(2)
  })

  it('(a) reduced motion: nothing is observed or animated, the numbers stay as printed', () => {
    stubs({ reduced: true })
    initBehaviors()
    expect(observers).toHaveLength(0)
    intersect()
    frameAt(600)
    expect(figures()).toEqual(['$1,200+', '99.9%'])
  })

  it('(c) no IntersectionObserver: static; with one, nothing moves until the figure is in view', () => {
    stubs({ observer: false })
    initBehaviors()
    expect(figures()).toEqual(['$1,200+', '99.9%'])

    document.body.innerHTML = STATS
    vi.unstubAllGlobals()
    stubs()
    initBehaviors()
    expect(observers).toHaveLength(2)
    frameAt(600)
    // Not in view yet: no frame was asked for, the numbers are the final ones.
    expect(figures()).toEqual(['$1,200+', '99.9%'])
  })

  it('(c) in view: counts from 0, halfway at half the time, and ends exactly on the printed number; prefix and suffix stay', () => {
    stubs()
    initBehaviors()
    intersect()
    frameAt(0)
    expect(figures()).toEqual(['$0+', '0.0%'])
    frameAt(600)
    expect(figures()[0]).toBe('$600+')
    frameAt(1200)
    expect(figures()).toEqual(['$1,200+', '99.9%'])
    expect(frames).toHaveLength(0)
  })

  it('wired once: a second init (a view transition) starts no second count', () => {
    stubs()
    initBehaviors()
    initBehaviors()
    expect(observers).toHaveLength(2)
  })
})
