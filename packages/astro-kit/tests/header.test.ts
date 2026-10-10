import { describe, expect, it } from 'vitest'
import { brandColorValue } from '../components/header/header'

describe('brandColorValue', () => {
  it('link is the site\'s link colour, the accent where none is set', () => {
    expect(brandColorValue('link')).toBe('var(--color-link, var(--color-accent))')
  })

  it('a colour the source theme gives the name is used as it is', () => {
    for (const colour of ['rgb(204, 51, 102)', 'rgba(0 0 0 / 50%)', '#C36', '#cc3366', 'hsl(330deg 60% 50%)']) expect(brandColorValue(colour)).toBe(colour)
  })

  it('absent or anything else: none, so the header keeps its text colour and no declaration is added', () => {
    for (const value of [undefined, '', 'red', 'red; background: url(x)', 'rgb(1,2,3); x: y', 'url(x)', 'var(--x)']) expect(brandColorValue(value)).toBeUndefined()
  })
})
