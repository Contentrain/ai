import type { FieldDef } from '@contentrain/types'
import { orderedFieldNames, resolveFieldLabel } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { validateModelDefinition } from '../../src/core/model-manager.js'

/**
 * `label` and `order` exist because a model carries a `name` and its fields
 * carried nothing. Fields are stored in canonical alphabetical order, so an
 * editor showed them alphabetically — `author` first and `title` fifteenth on
 * a sixteen-field article model — labelled with the raw key (`body_public`,
 * `is_category_hero`).
 *
 * Both are optional. A model that has neither behaves exactly as it did.
 */

const model = (fields: Record<string, unknown>) =>
  validateModelDefinition({ id: 'posts', kind: 'collection', title_field: 'title', fields: { title: { type: 'string', required: true }, ...fields } })

/** A string field, optionally with a display order. */
const f = (order?: number): FieldDef => order === undefined ? { type: 'string' } : { type: 'string', order }

describe('orderedFieldNames', () => {
  it('sorts by order, ascending', () => {
    expect(orderedFieldNames({ zebra: f(1), apple: f(2), mango: f(3) }))
      .toEqual(['zebra', 'apple', 'mango'])
  })

  // The compatibility rule: a model with no order behaves as it does today.
  it('falls back to alphabetical when nothing declares an order', () => {
    expect(orderedFieldNames({ zebra: f(), apple: f(), mango: f() }))
      .toEqual(['apple', 'mango', 'zebra'])
  })

  it('puts unordered fields after ordered ones, alphabetical among themselves', () => {
    expect(orderedFieldNames({ zebra: f(), apple: f(), title: f(1), body: f(2) }))
      .toEqual(['title', 'body', 'apple', 'zebra'])
  })

  it('breaks an order tie alphabetically, so the result is deterministic', () => {
    expect(orderedFieldNames({ zebra: f(5), apple: f(5) })).toEqual(['apple', 'zebra'])
  })

  // Fractions let a field be inserted between two others without renumbering.
  it('honours fractional order', () => {
    expect(orderedFieldNames({ a: f(1), c: f(2), b: f(1.5) })).toEqual(['a', 'b', 'c'])
  })

  it('handles a model with no fields', () => {
    expect(orderedFieldNames(undefined)).toEqual([])
  })
})

describe('resolveFieldLabel', () => {
  it('uses a plain string for every locale', () => {
    expect(resolveFieldLabel('body_public', { label: 'Body (public)' }, 'tr')).toBe('Body (public)')
  })

  it('picks the requested locale', () => {
    const label = { en: 'Body (public)', tr: 'Gövde (herkese açık)' }
    expect(resolveFieldLabel('body_public', { label }, 'tr')).toBe('Gövde (herkese açık)')
  })

  it('falls back to the default locale, then to any, then to the field name', () => {
    const label = { en: 'Body' }
    expect(resolveFieldLabel('body_public', { label }, 'tr', 'en')).toBe('Body')
    expect(resolveFieldLabel('body_public', { label }, 'tr')).toBe('Body')
    expect(resolveFieldLabel('body_public', {}, 'tr')).toBe('body_public')
  })
})

describe('validateModelDefinition — label and order', () => {
  it('accepts a plain label and an order', () => {
    expect(model({ body: { type: 'text', label: 'Body', order: 10 } }).errors).toEqual([])
  })

  it('accepts a per-locale label', () => {
    expect(model({ body: { type: 'text', label: { 'en': 'Body', 'pt-BR': 'Corpo' } } }).errors).toEqual([])
  })

  it('accepts a fractional order', () => {
    expect(model({ body: { type: 'text', order: 1.5 } }).errors).toEqual([])
  })

  // The same inversion the vocabulary hits: keys that are not locales resolve
  // to nothing, and nothing says so.
  it('rejects a label object whose keys are not locales', () => {
    const { errors } = model({ body: { type: 'text', label: { Body: 'en' } } })
    expect(errors.some(e => e.includes('"Body" is not a locale code'))).toBe(true)
    expect(errors.some(e => e.includes('nests as { "en": "…", "tr": "…" }'))).toBe(true)
  })

  it.each([
    ['an empty string', { label: '' }, 'is empty'],
    ['no translations', { label: {} }, 'has no translations'],
    ['an empty translation', { label: { en: '  ' } }, 'must be a non-empty string'],
    ['a number', { label: 42 }, 'must be a string, or an object keyed by locale'],
    ['an array', { label: ['Body'] }, 'must be a string, or an object keyed by locale'],
  ])('rejects %s', (_case, extra, message) => {
    const { errors } = model({ body: { type: 'text', ...extra } })
    expect(errors.some(e => e.includes(message))).toBe(true)
  })

  it.each([
    ['a string', 'first'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects order that is %s', (_case, order) => {
    const { errors } = model({ body: { type: 'text', order } })
    expect(errors.some(e => e.includes('"order" must be a finite number'))).toBe(true)
  })

  it('validates them on nested object fields too', () => {
    const { errors } = model({
      seo: { type: 'object', fields: { title: { type: 'string', label: { Nope: 'x' } } } },
    })
    expect(errors.some(e => e.includes('Field "seo.title": "label" key "Nope"'))).toBe(true)
  })

  it('leaves a model that declares neither alone', () => {
    expect(model({ body: { type: 'text' } }).errors).toEqual([])
  })
})
