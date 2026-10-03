import { describe, expect, it } from 'vitest'
import { coverHeight, headingStyle } from '../components/hero/hero'

describe('hero cover height', () => {
  it('is a whole number of pixels in a sane range', () => {
    expect(coverHeight(520)).toBe('520px')
    expect(coverHeight(100)).toBe('100px')
    expect(coverHeight(2000)).toBe('2000px')
  })

  it('ignores anything else: a plan value is data, not CSS', () => {
    for (const value of [undefined, 0, 99, 2001, 52.5, Number.NaN, Number.POSITIVE_INFINITY, '520px' as unknown as number, '10px; color: red' as unknown as number]) expect(coverHeight(value)).toBeUndefined()
  })
})

describe('hero heading scale', () => {
  it('theme takes the site\'s size for the heading\'s level, with the layout scale as fallback', () => {
    expect(headingStyle('theme', 1)).toBe('font-size: var(--text-heading-1, var(--text-5xl)); line-height: var(--leading-heading, 1.2)')
    expect(headingStyle('theme', 2)).toContain('var(--text-heading-2,')
  })

  it('default, or none, adds nothing', () => {
    expect(headingStyle('default', 1)).toBeUndefined()
    expect(headingStyle(undefined, 1)).toBeUndefined()
  })
})
