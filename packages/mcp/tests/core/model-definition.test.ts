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

/**
 * Injects a dedicated, always-valid title field so these cases stay about field
 * shapes. Pointing `title_field` at the field under test would make every case
 * assert two rules at once. The title_field rules get their own block at the end.
 */
const model = (fields: Record<string, unknown>, kind = 'collection') =>
  validateModelDefinition({
    id: 'posts',
    kind,
    title_field: kind === 'dictionary' ? 'key' : 'heading',
    fields: kind === 'dictionary' ? fields : { heading: { type: 'string', required: true }, ...fields },
  })

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

/**
 * `title_field` rules.
 *
 * The property exists because consumers were inferring an entry's title from
 * field order and length, and picking the icon over the headline. An inferred
 * title is a guess; a declared one is a contract — so the declaration has to be
 * checked, or it is just a different place to be wrong.
 */
describe('validateModelDefinition — title_field', () => {
  const check = (input: Record<string, unknown>) =>
    validateModelDefinition({ id: 'posts', kind: 'collection', ...input })

  const FIELDS = { title: { type: 'string', required: true }, cover: { type: 'image' } }

  describe('presence', () => {
    it.each([
      ['missing', undefined],
      ['null', null],
      ['empty string', ''],
    ])('rejects %s', (_label, value) => {
      const { errors } = check({ title_field: value, fields: FIELDS })
      expect(errors).toContain('Missing "title_field". Every model must name the field shown as its title. Dictionary models use "key".')
    })

    // The read path is an unvalidated `JSON.parse(...) as ModelDefinition`, so a
    // non-string can reach here while the type system believes otherwise.
    it.each([
      [42, 'number'],
      [true, 'boolean'],
      [['title'], 'object'],
    ])('rejects a %s value', (value, typeName) => {
      const { errors } = check({ title_field: value, fields: FIELDS })
      expect(errors).toContain(`Invalid "title_field": must be a string, got ${typeName}.`)
    })

    it('reports exactly one title_field error, not a cascade', () => {
      const { errors } = check({ fields: FIELDS })
      expect(errors.filter(e => e.includes('title_field'))).toHaveLength(1)
    })
  })

  describe('dictionary', () => {
    const dict = (title_field: unknown) =>
      validateModelDefinition({ id: 'ui-strings', kind: 'dictionary', title_field })

    it('accepts the reserved key sentinel', () => {
      expect(dict('key').errors).toEqual([])
    })

    it('rejects any other value', () => {
      expect(dict('label').errors).toContain(
        'Dictionary models must use title_field: "key". Dictionaries have no fields — the key is the title. Got "label".',
      )
    })

    it('still requires the property', () => {
      expect(dict(undefined).errors.some(e => e.includes('Missing "title_field"'))).toBe(true)
    })
  })

  describe('resolution', () => {
    it('rejects a field that is not declared', () => {
      const { errors } = check({ title_field: 'headline', fields: FIELDS })
      expect(errors).toContain('Invalid "title_field": field "headline" is not defined in fields.')
    })

    it('rejects a model with no fields to point at', () => {
      const { errors } = check({ title_field: 'title' })
      expect(errors).toContain('Invalid "title_field": "title" cannot resolve — the model declares no fields.')
    })

    it('explains the sentinel when a non-dictionary reaches for it', () => {
      const { errors } = check({ title_field: 'key', fields: FIELDS })
      expect(errors).toContain('Invalid "title_field": field "key" is not defined in fields. "key" is reserved for dictionary models.')
    })

    // "key" is a legal snake_case field name, and dictionaries have no fields at
    // all, so the sentinel cannot actually collide with a real field.
    it('accepts a non-dictionary field genuinely named key', () => {
      const { errors } = check({ title_field: 'key', fields: { key: { type: 'string', required: true } } })
      expect(errors).toEqual([])
    })
  })

  describe('type', () => {
    it.each(['string', 'text', 'slug', 'email', 'url', 'code', 'markdown', 'richtext'])(
      'accepts %s',
      (type) => {
        const { errors } = check({ title_field: 'label', fields: { label: { type, required: true } } })
        expect(errors).toEqual([])
      },
    )

    // These all store strings. That is exactly why the rule is by semantics and
    // not by `typeof`: `#ff0000` and `f3a81c09d24e` are strings too.
    it.each(['icon', 'color', 'phone', 'select', 'date', 'datetime', 'image', 'video', 'file', 'relation'])(
      'rejects string-typed but undisplayable %s',
      (type) => {
        const fields = type === 'relation'
          ? { label: { type, model: 'authors' } }
          : type === 'select' ? { label: { type, options: ['a', 'b'] } } : { label: { type } }
        const { errors } = check({ title_field: 'label', fields })
        expect(errors.some(e => e.startsWith(`Invalid "title_field": field "label" has type "${type}"`))).toBe(true)
      },
    )

    it.each(['number', 'integer', 'boolean', 'rating', 'array', 'object'])('rejects non-string %s', (type) => {
      const fields = type === 'array' ? { label: { type, items: 'string' } } : { label: { type } }
      const { errors } = check({ title_field: 'label', fields })
      expect(errors.some(e => e.startsWith(`Invalid "title_field": field "label" has type "${type}"`))).toBe(true)
    })

    it('names the allowed types in the error so the fix is obvious', () => {
      const { errors } = check({ title_field: 'cover', fields: FIELDS })
      expect(errors.some(e => e.includes('a title must be one of: string, text, slug, email, url, code, markdown, richtext.'))).toBe(true)
    })
  })

  describe('optional target', () => {
    it('warns without blocking when the title field may be empty', () => {
      const { errors, warnings } = check({ title_field: 'label', fields: { label: { type: 'string' } } })
      expect(errors).toEqual([])
      expect(warnings).toContain('"title_field" points at optional field "label" — entries may render with an empty title. Consider required: true.')
    })

    it('stays quiet when the field is required', () => {
      const { warnings } = check({ title_field: 'title', fields: FIELDS })
      expect(warnings).toEqual([])
    })
  })
})

/**
 * `{ "type": "object", "fields": {} }` is neither validated nor editable — it
 * renders as an empty frame. Worth saying, but not worth refusing: it is a
 * legitimate state while a schema is being designed.
 */
describe('validateModelDefinition — an object with no shape', () => {
  const withField = (field: Record<string, unknown>) =>
    validateModelDefinition({
      id: 'posts',
      kind: 'collection',
      title_field: 'title',
      fields: { title: { type: 'string', required: true }, seo: field },
    })

  it.each([
    ['no fields key', { type: 'object' }],
    ['an empty fields object', { type: 'object', fields: {} }],
  ])('warns about %s', (_case, field) => {
    const { errors, warnings } = withField(field)
    expect(errors).toEqual([])
    expect(warnings.some(w => w.includes('no editor can render it'))).toBe(true)
  })

  it('says nothing when the shape is declared', () => {
    const { warnings } = withField({ type: 'object', fields: { title: { type: 'string' } } })
    expect(warnings).toEqual([])
  })
})
