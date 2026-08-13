import { describe, expect, it } from 'vitest'
import { inferTitleField } from '../../src/core/model-manager.js'

type Fields = Record<string, Record<string, unknown>>

const f = (type: string, required = false): Record<string, unknown> =>
  required ? { type, required: true } : { type }

describe('inferTitleField', () => {
  describe('dictionary', () => {
    it('resolves to the reserved key sentinel, with or without a fields object', () => {
      expect(inferTitleField('dictionary')).toEqual({ field: 'key', rule: 'dictionary' })
      expect(inferTitleField('dictionary', {})).toEqual({ field: 'key', rule: 'dictionary' })
    })
  })

  describe('name match', () => {
    it.each([
      ['title', { title: f('string'), body: f('text') }, 'title'],
      ['name', { name: f('string'), body: f('text') }, 'name'],
      ['label', { label: f('string'), body: f('text') }, 'label'],
      ['heading', { heading: f('string'), body: f('text') }, 'heading'],
    ])('matches %s exactly', (_hint, fields, expected) => {
      expect(inferTitleField('collection', fields as Fields)).toEqual({ field: expected, rule: 'name-match' })
    })

    it('prefers the more explicit hint when several match', () => {
      const fields: Fields = { name: f('string'), title: f('string'), label: f('string') }
      expect(inferTitleField('collection', fields)).toEqual({ field: 'title', rule: 'name-match' })
    })

    it('matches a snake_case token, ranked below an exact match', () => {
      expect(inferTitleField('collection', { brand_name: f('string') } as Fields))
        .toEqual({ field: 'brand_name', rule: 'name-match' })
      expect(inferTitleField('collection', { page_title: f('string'), body: f('text') } as Fields))
        .toEqual({ field: 'page_title', rule: 'name-match' })
      expect(inferTitleField('collection', { brand_name: f('string'), name: f('string') } as Fields))
        .toEqual({ field: 'name', rule: 'name-match' })
    })

    it('does not match a hint buried inside a single token', () => {
      // "filename" tokenizes to ["filename"], not ["file", "name"] — so this falls
      // through to the required-displayable rung rather than winning on its name.
      const fields: Fields = { filename: f('string'), summary: f('text', true) }
      expect(inferTitleField('collection', fields)).toEqual({ field: 'summary', rule: 'required-displayable' })
    })

    // The bug this whole contract replaces: an unfiltered name match hands the
    // title to a field called `name` that happens to be typed `icon`.
    it('skips a hint-named field whose type cannot render as a title', () => {
      const fields: Fields = { name: f('icon'), label: f('string') }
      expect(inferTitleField('collection', fields)).toEqual({ field: 'label', rule: 'name-match' })
    })

    it('ignores a hint-named relation, image or select', () => {
      for (const type of ['relation', 'image', 'select', 'color', 'date']) {
        expect(inferTitleField('collection', { title: f(type), summary: f('string', true) } as Fields))
          .toEqual({ field: 'summary', rule: 'required-displayable' })
      }
    })
  })

  describe('type priority within a rung', () => {
    // The tie-break that matters: "first required text field" resolves
    // alphabetically, which titles a FAQ by its answers instead of its questions.
    it('prefers a short scalar over a long-form body', () => {
      const faq: Fields = {
        answer: f('text', true),
        category: f('string'),
        order: f('number'),
        question: f('string', true),
      }
      expect(inferTitleField('collection', faq)).toEqual({ field: 'question', rule: 'required-displayable' })
    })

    it('orders string > slug > text > markdown > richtext', () => {
      expect(inferTitleField('collection', { a: f('richtext'), b: f('string') } as Fields))
        .toEqual({ field: 'b', rule: 'displayable' })
      expect(inferTitleField('collection', { a: f('markdown'), b: f('slug') } as Fields))
        .toEqual({ field: 'b', rule: 'displayable' })
      expect(inferTitleField('collection', { a: f('text'), b: f('slug') } as Fields))
        .toEqual({ field: 'b', rule: 'displayable' })
    })

    it('falls back to name order for equal types', () => {
      expect(inferTitleField('collection', { zebra: f('string'), apple: f('string') } as Fields))
        .toEqual({ field: 'apple', rule: 'displayable' })
    })
  })

  describe('required beats optional', () => {
    it('prefers a required field even when an optional one has a better type', () => {
      const fields: Fields = { slug_ref: f('slug'), summary: f('text', true) }
      expect(inferTitleField('collection', fields)).toEqual({ field: 'summary', rule: 'required-displayable' })
    })
  })

  describe('no answer', () => {
    it('returns null rather than guessing', () => {
      // Guessing `cover` or `author` here would re-create the exact bug: a row
      // titled by an image path or a relation ID.
      expect(inferTitleField('collection')).toBeNull()
      expect(inferTitleField('collection', {})).toBeNull()
      expect(inferTitleField('collection', { cover: f('image'), author: f('relation'), rank: f('number') } as Fields)).toBeNull()
    })

    it('ignores malformed field definitions instead of throwing', () => {
      expect(inferTitleField('collection', { broken: {}, ok: f('string') } as Fields))
        .toEqual({ field: 'ok', rule: 'displayable' })
      expect(inferTitleField('collection', { broken: { type: 42 } } as unknown as Fields)).toBeNull()
    })
  })

  // The three models named in the report that prompted this change. Studio picked
  // the icon, the slug and a relation ID respectively.
  describe('the models that motivated the change', () => {
    it('Integration Groups resolves to title, not icon', () => {
      const fields: Fields = {
        description: f('text'),
        icon: f('icon'),
        items: f('relations'),
        title: f('string', true),
      }
      expect(inferTitleField('collection', fields)).toEqual({ field: 'title', rule: 'name-match' })
    })

    it('Articles resolves to title, not slug', () => {
      const fields: Fields = {
        body: f('markdown'),
        cover: f('image'),
        slug: f('slug', true),
        title: f('string', true),
      }
      expect(inferTitleField('collection', fields)).toEqual({ field: 'title', rule: 'name-match' })
    })

    it('Hero Slides resolves to title, not a relation ID', () => {
      const fields: Fields = {
        cta: f('relation'),
        image: f('image'),
        subtitle: f('string'),
        title: f('string', true),
      }
      expect(inferTitleField('collection', fields)).toEqual({ field: 'title', rule: 'name-match' })
    })
  })

  // This repo dogfoods its own models; migrating them is the tool's first real run.
  describe('this repo’s own models', () => {
    it.each([
      ['docs-guide', 'document', { category: f('select'), description: f('text'), order: f('integer'), title: f('string', true) }, 'title', 'name-match'],
      ['docs-guides', 'document', { description: f('text'), order: f('integer'), title: f('string', true) }, 'title', 'name-match'],
      ['docs-packages', 'document', { description: f('text'), order: f('integer'), title: f('string', true) }, 'title', 'name-match'],
      ['docs-reference', 'document', { description: f('text'), order: f('integer'), title: f('string', true) }, 'title', 'name-match'],
      ['faq', 'collection', { answer: f('text', true), category: f('string'), order: f('number'), question: f('string', true) }, 'question', 'required-displayable'],
      ['hero', 'collection', { cta_link: f('string', true), cta_text: f('string', true), image: f('image'), subtitle: f('string'), title: f('string', true) }, 'title', 'name-match'],
      ['integrations', 'collection', { category: f('select', true), description: f('text', true), name: f('string', true), slug: f('slug', true), website: f('url') }, 'name', 'name-match'],
      ['navigation', 'singleton', { brand_name: f('string', true), cta_link: f('string'), cta_text: f('string') }, 'brand_name', 'name-match'],
      ['pricing', 'collection', { currency: f('string'), features: f('array'), highlighted: f('boolean'), name: f('string', true), period: f('string'), price: f('number', true) }, 'name', 'name-match'],
      ['showcase', 'collection', { body: f('text'), content: f('markdown'), cover: f('image'), handle: f('slug'), snippet: f('code'), title: f('string', true) }, 'title', 'name-match'],
    ])('%s resolves to %s', (_id, kind, fields, expectedField, expectedRule) => {
      expect(inferTitleField(kind as string, fields as Fields))
        .toEqual({ field: expectedField, rule: expectedRule })
    })

    it('serve-ui-texts (dictionary) resolves to the key sentinel', () => {
      expect(inferTitleField('dictionary')).toEqual({ field: 'key', rule: 'dictionary' })
    })
  })
})
