import { describe, expect, it } from 'vitest'
import { profile } from '../components/team/team'

describe('profile', () => {
  it('names a known network by its host, www or not', () => {
    expect(profile('https://www.linkedin.com/in/ada').label).toBe('LinkedIn')
    expect(profile('https://x.com/ada').label).toBe('X')
  })

  it('shows an unknown host as itself', () => {
    expect(profile('https://ada.example/about').label).toBe('ada.example')
  })

  it('never labels a mailto or tel address with an empty string', () => {
    expect(profile('mailto:ada@example.com').label).toBe('mailto:ada@example.com')
    expect(profile('tel:+441234567').label).toBe('tel:+441234567')
    expect(profile('/about').label).toBe('/about')
  })
})
