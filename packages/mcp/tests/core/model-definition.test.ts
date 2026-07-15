import { describe, expect, it } from 'vitest'
import { validateModelDefinition } from '../../src/core/model-manager.js'

/**
 * Schema-shape rules for model_save.
 *
 * The governing principle: do not accept a constraint that will not be enforced.
 * `accept`, `maxSize` and `default` were declared, stored, and read by nothing;
 * `options` on a non-select was accepted and silently ignored. A constraint that
 * does nothing is worse than no constraint — the author stops looking.
 */

const model = (fields: Record<string, unknown>, kind = 'collection') =>
  validateModelDefinition({ id: 'posts', kind, fields })

describe('validateModelDefinition', () => {
  it('accepts a well-formed model', () => {
    const { errors, warnings } = model({
      title: { type: 'string', required: true, max: 120 },
      slug: { type: 'slug', required: true, unique: true },
      status: { type: 'select', options: ['draft', 'live'], default: 'draft' },
    })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  describe('constraints declared where they cannot apply', () => {
    it('rejects options on a non-select field', () => {
      const { errors } = model({ title: { type: 'string', options: ['a', 'b'] } })
      expect(errors.some(e => /"options" only applies to select/.test(e))).toBe(true)
    })

    it('rejects items on a non-array field', () => {
      const { errors } = model({ title: { type: 'string', items: 'string' } })
      expect(errors.some(e => /"items" only applies to array/.test(e))).toBe(true)
    })

    it('rejects fields on a non-object field', () => {
      const { errors } = model({ title: { type: 'string', fields: { a: { type: 'string' } } } })
      expect(errors.some(e => /"fields" only applies to object/.test(e))).toBe(true)
    })

    it('rejects accept and maxSize on a non-media field', () => {
      const { errors } = model({ title: { type: 'string', accept: 'image/*', maxSize: 100 } })
      expect(errors.some(e => /"accept" only applies to image\/video\/file/.test(e))).toBe(true)
      expect(errors.some(e => /"maxSize" only applies to image\/video\/file/.test(e))).toBe(true)
    })

    it('rejects unique on a singleton — there is nothing to compare against', () => {
      const { errors } = model({ title: { type: 'string', unique: true } }, 'singleton')
      expect(errors.some(e => /"unique" has no meaning on a singleton/.test(e))).toBe(true)
    })

    it('allows unique on a collection and a document', () => {
      expect(model({ sku: { type: 'string', unique: true } }, 'collection').errors).toEqual([])
      expect(model({ sku: { type: 'string', unique: true } }, 'document').errors).toEqual([])
    })
  })

  describe('incoherent constraints', () => {
    it('rejects min greater than max', () => {
      const { errors } = model({ title: { type: 'string', min: 10, max: 5 } })
      expect(errors.some(e => /min \(10\) is greater than max \(5\)/.test(e))).toBe(true)
    })

    it('rejects a pattern that does not compile', () => {
      // Left to validation time this degrades to a per-entry warning, silently
      // disabling the constraint.
      const { errors } = model({ title: { type: 'string', pattern: '[invalid' } })
      expect(errors.some(e => /not a valid regular expression/.test(e))).toBe(true)
    })

    it('rejects a default outside its own options', () => {
      const { errors } = model({ status: { type: 'select', options: ['a', 'b'], default: 'z' } })
      expect(errors.some(e => /default "z" is not one of its own options/.test(e))).toBe(true)
    })

    it('rejects a default of the wrong type', () => {
      const { errors } = model({ count: { type: 'number', default: 'lots' } })
      expect(errors.some(e => /default must be a number/.test(e))).toBe(true)
    })
  })

  describe('nested schemas', () => {
    it('validates a nested object field', () => {
      const { errors } = model({
        seo: { type: 'object', fields: { title: { type: 'bogus' } } },
      })
      expect(errors.some(e => /Field "seo.title": invalid type "bogus"/.test(e))).toBe(true)
    })

    it('validates a nested select without options', () => {
      const { errors } = model({
        seo: { type: 'object', fields: { kind: { type: 'select' } } },
      })
      expect(errors.some(e => /Field "seo.kind": select type requires/.test(e))).toBe(true)
    })

    it('validates a nested field name', () => {
      const { errors } = model({
        seo: { type: 'object', fields: { BadName: { type: 'string' } } },
      })
      expect(errors.some(e => /Field "seo.BadName": invalid name/.test(e))).toBe(true)
    })

    it('validates an items FieldDef', () => {
      const { errors } = model({
        tags: { type: 'array', items: { type: 'select' } },
      })
      expect(errors.some(e => /Field "tags.items": select type requires/.test(e))).toBe(true)
    })

    it('validates an items type given as a string', () => {
      const { errors } = model({ tags: { type: 'array', items: 'bogus' } })
      expect(errors.some(e => /Field "tags.items": invalid type "bogus"/.test(e))).toBe(true)
    })

    it('bounds runaway nesting', () => {
      let field: Record<string, unknown> = { type: 'string' }
      for (let i = 0; i < 15; i++) field = { type: 'array', items: field }
      const { errors } = model({ deep: field })
      expect(errors.some(e => /nesting depth/.test(e))).toBe(true)
    })
  })

  describe('constraints MCP cannot enforce are stated, not hidden', () => {
    it('warns that maxSize is the provider’s job', () => {
      const { errors, warnings } = model({ cover: { type: 'image', maxSize: 500_000 } })
      // Not an error — the constraint is legitimate, MCP just cannot check it.
      expect(errors).toEqual([])
      expect(warnings.some(w => /"maxSize" is not enforced by MCP/.test(w))).toBe(true)
      expect(warnings.some(w => /ingested/.test(w))).toBe(true)
    })

    it('warns that max on a media field measures the path, not the file', () => {
      const { errors, warnings } = model({ cover: { type: 'image', max: 100 } })
      expect(errors).toEqual([])
      expect(warnings.some(w => /limits the length of the stored path string/.test(w))).toBe(true)
    })

    it('does not warn about max on an ordinary string field', () => {
      const { warnings } = model({ title: { type: 'string', max: 100 } })
      expect(warnings).toEqual([])
    })
  })

  describe('pre-existing rules still hold', () => {
    it('rejects a non-kebab-case model id', () => {
      const { errors } = validateModelDefinition({ id: 'Blog_Post', kind: 'collection', fields: {} })
      expect(errors.some(e => /must be kebab-case/.test(e))).toBe(true)
    })

    it('rejects fields on a dictionary', () => {
      const { errors } = model({ title: { type: 'string' } }, 'dictionary')
      expect(errors.some(e => /Dictionary models cannot have fields/.test(e))).toBe(true)
    })

    it('rejects a relation without a model', () => {
      const { errors } = model({ author: { type: 'relation' } })
      expect(errors.some(e => /requires "model" property/.test(e))).toBe(true)
    })
  })
})
