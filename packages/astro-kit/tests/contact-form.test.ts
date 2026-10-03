import { describe, expect, it } from 'vitest'
import { contactSectionBare } from '../components/contact-form/contact-form'

describe('contactSectionBare', () => {
  it('a heading alone, with no form to show, is not drawn (the page would print a heading over empty space)', () => {
    expect(contactSectionBare({ formShown: false })).toBe(true)
    expect(contactSectionBare({ formShown: false, intro: '', details: [] })).toBe(true)
  })

  it('draws the section once the form has a home, even with only its heading', () => {
    expect(contactSectionBare({ formShown: true })).toBe(false)
  })

  it('draws the section while it has an introduction or contact details to show', () => {
    expect(contactSectionBare({ formShown: false, intro: 'We answer within two working days.' })).toBe(false)
    expect(contactSectionBare({ formShown: false, details: [{ value: 'hello@example.com' }] })).toBe(false)
  })
})
