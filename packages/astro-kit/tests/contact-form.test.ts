import { describe, expect, it } from 'vitest'
import { contactSectionBare } from '../components/contact-form/contact-form'

describe('contactSectionBare', () => {
  it('a section with nothing at all to show, and no form to show, is not drawn', () => {
    expect(contactSectionBare({ formShown: false })).toBe(true)
    expect(contactSectionBare({ formShown: false, heading: '', intro: '', details: [] })).toBe(true)
  })

  it('keeps a heading-only section when the form is hidden (a public run): the source\'s heading is not dropped with the form', () => {
    expect(contactSectionBare({ formShown: false, heading: 'Bize yazın' })).toBe(false)
    expect(contactSectionBare({ formShown: false, heading: 'Bize yazın', intro: '', details: [] })).toBe(false)
  })

  it('draws the section once the form has a home, even with nothing else', () => {
    expect(contactSectionBare({ formShown: true })).toBe(false)
    expect(contactSectionBare({ formShown: true, heading: 'Bize yazın' })).toBe(false)
  })

  it('draws the section while it has an introduction or contact details to show', () => {
    expect(contactSectionBare({ formShown: false, intro: 'We answer within two working days.' })).toBe(false)
    expect(contactSectionBare({ formShown: false, details: [{ value: 'hello@example.com' }] })).toBe(false)
  })
})
