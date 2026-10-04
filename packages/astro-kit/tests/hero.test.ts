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

describe('hero heading size', () => {
  it('names the level whose site size an h2 takes (a second h1 written as an h2 keeps the h1 size), with or without theme', () => {
    expect(headingStyle('theme', 2, 'h1')).toBe(headingStyle('theme', 1))
    expect(headingStyle('default', 2, 'h1')).toBe(headingStyle('theme', 1))
    expect(headingStyle(undefined, 1, 'h2')).toContain('var(--text-heading-2,')
  })

  it('own, or none, changes nothing: the output is byte-identical to before', () => {
    for (const scale of ['default', 'theme', undefined] as const) for (const level of [1, 2] as const) {
      expect(headingStyle(scale, level, 'own')).toBe(headingStyle(scale, level))
      expect(headingStyle(scale, level, undefined)).toBe(headingStyle(scale, level))
    }
    expect(headingStyle('theme', 2, 'own')).toContain('var(--text-heading-2,')
    expect(headingStyle('default', 1, 'own')).toBeUndefined()
  })
})
