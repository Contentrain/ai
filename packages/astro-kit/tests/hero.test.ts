import { describe, expect, it } from 'vitest'
import { size } from '../components/hero/hero'

describe('hero size', () => {
  it('passes a plain CSS size through', () => {
    for (const value of ['520px', '60vh', '3.6rem', '120%', 'clamp(2.15rem, 4vw, 3.6rem)', 'calc(100vh - 4rem)']) expect(size(value)).toBe(value)
  })

  it('ignores anything else: a plan value is data, not CSS', () => {
    for (const value of [undefined, '', 'big', '58', '10px; color: red', 'url(x)', 'calc(1px + url(x))', '1px}</style>', 'expression(alert(1))']) expect(size(value)).toBeUndefined()
  })
})
