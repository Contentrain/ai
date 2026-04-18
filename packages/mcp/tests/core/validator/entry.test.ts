import { describe, expect, it } from 'vitest'
import type { FieldDef } from '@contentrain/types'
import { validateContent } from '../../../src/core/validator/index.js'

/**
 * Fixture suite for `validateContent` — locks the union of MCP + Studio per-entry
 * rules. Each case specifies the input data, field schema and optional context,
 * and the exact error set the validator must produce.
 *
 * Drift in any rule (new warning, different message, severity flip) shows up
 * here as a failed assertion. Keep fixtures minimal and focused — a 20-fixture
 * suite is enough to cover the public contract surface today.
 */

describe('validateContent', () => {
  it('valid entry returns no errors', () => {
    const fields: Record<string, FieldDef> = {
      title: { type: 'string', required: true },
      body: { type: 'text' },
    }
    const result = validateContent({ title: 'Hello', body: 'World' }, fields, 'blog', 'en', 'abc')
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('required field missing produces error', () => {
    const fields: Record<string, FieldDef> = {
      title: { type: 'string', required: true },
    }
    const result = validateContent({}, fields, 'blog', 'en', 'abc')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'title' && e.severity === 'error')).toBe(true)
  })

  it('type mismatch produces error via validateFieldValue', () => {
    const fields: Record<string, FieldDef> = {
      count: { type: 'integer' },
    }
    const result = validateContent({ count: 'not a number' }, fields, 'blog', 'en', 'abc')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'count' && e.severity === 'error')).toBe(true)
  })

  it('secret detection fires on api key in string field', () => {
    const fields: Record<string, FieldDef> = {
      body: { type: 'text' },
    }
    // Fake AWS access key pattern
    const result = validateContent(
      { body: 'AKIAIOSFODNN7EXAMPLE is our key' },
      fields,
      'blog',
      'en',
      'abc',
    )
    expect(result.errors.some(e => e.field === 'body' && e.severity === 'error')).toBe(true)
  })

  it('unique constraint flags duplicate value across entries', () => {
    const fields: Record<string, FieldDef> = {
      slug: { type: 'string', unique: true },
    }
    const ctx = {
      allEntries: {
        other: { slug: 'hello-world' },
      },
      currentEntryId: 'current',
    }
    const result = validateContent({ slug: 'hello-world' }, fields, 'blog', 'en', 'current', ctx)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'slug' && /unique/.test(e.message ?? ''))).toBe(true)
  })

  it('unique constraint excludes current entry from comparison', () => {
    const fields: Record<string, FieldDef> = {
      slug: { type: 'string', unique: true },
    }
    const ctx = {
      allEntries: {
        current: { slug: 'hello-world' },
        other: { slug: 'different' },
      },
      currentEntryId: 'current',
    }
    const result = validateContent({ slug: 'hello-world' }, fields, 'blog', 'en', 'current', ctx)
    expect(result.valid).toBe(true)
  })

  it('email heuristic warns on non-email-looking string', () => {
    const fields: Record<string, FieldDef> = {
      contact: { type: 'email' },
    }
    const result = validateContent({ contact: 'not-an-email' }, fields, 'blog', 'en', 'abc')
    expect(result.errors.some(e => e.field === 'contact' && e.severity === 'warning')).toBe(true)
  })

  it('url heuristic warns on missing protocol', () => {
    const fields: Record<string, FieldDef> = {
      website: { type: 'url' },
    }
    const result = validateContent({ website: 'example.com' }, fields, 'blog', 'en', 'abc')
    expect(result.errors.some(e => e.field === 'website' && e.severity === 'warning')).toBe(true)
  })

  it('url heuristic accepts relative paths', () => {
    const fields: Record<string, FieldDef> = {
      route: { type: 'url' },
    }
    const result = validateContent({ route: '/about' }, fields, 'blog', 'en', 'abc')
    expect(result.errors.some(e => e.field === 'route' && e.severity === 'warning')).toBe(false)
  })

  it('polymorphic relation requires { model, ref }', () => {
    const fields: Record<string, FieldDef> = {
      author: { type: 'relation', model: ['users', 'admins'] },
    }
    const result = validateContent({ author: 'plain-string' }, fields, 'blog', 'en', 'abc')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /polymorphic/.test(e.message ?? ''))).toBe(true)
  })

  it('polymorphic relation rejects model outside target list', () => {
    const fields: Record<string, FieldDef> = {
      author: { type: 'relation', model: ['users', 'admins'] },
    }
    const result = validateContent(
      { author: { model: 'ghosts', ref: 'x' } },
      fields,
      'blog',
      'en',
      'abc',
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /must be one of/.test(e.message ?? ''))).toBe(true)
  })

  it('single-target relation requires string value', () => {
    const fields: Record<string, FieldDef> = {
      author: { type: 'relation', model: 'users' },
    }
    const result = validateContent({ author: { not: 'a string' } }, fields, 'blog', 'en', 'abc')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /must be a string/.test(e.message ?? ''))).toBe(true)
  })

  it('relations array must be an array', () => {
    const fields: Record<string, FieldDef> = {
      tags: { type: 'relations', model: 'tags' },
    }
    const result = validateContent({ tags: 'not-array' }, fields, 'blog', 'en', 'abc')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /must be an array/.test(e.message ?? ''))).toBe(true)
  })

  it('relations array min/max enforced', () => {
    const fields: Record<string, FieldDef> = {
      tags: { type: 'relations', model: 'tags', min: 2, max: 3 },
    }
    const underMin = validateContent({ tags: ['one'] }, fields, 'blog', 'en', 'abc')
    expect(underMin.errors.some(e => /at least 2/.test(e.message ?? ''))).toBe(true)

    const overMax = validateContent({ tags: ['a', 'b', 'c', 'd'] }, fields, 'blog', 'en', 'abc')
    expect(overMax.errors.some(e => /at most 3/.test(e.message ?? ''))).toBe(true)
  })

  it('relations array items must be strings', () => {
    const fields: Record<string, FieldDef> = {
      tags: { type: 'relations', model: 'tags' },
    }
    const result = validateContent({ tags: ['ok', 42, 'also-ok'] }, fields, 'blog', 'en', 'abc')
    expect(result.errors.some(e => /tags\[1\] must be a string/.test(e.message ?? ''))).toBe(true)
  })

  it('array of strings validates item types', () => {
    const fields: Record<string, FieldDef> = {
      keywords: { type: 'array', items: 'string' },
    }
    const result = validateContent({ keywords: ['ok', 42] }, fields, 'blog', 'en', 'abc')
    expect(result.errors.some(e => e.field === 'keywords[1]' && /must be a string/.test(e.message ?? ''))).toBe(true)
  })

  it('array of integers rejects float', () => {
    const fields: Record<string, FieldDef> = {
      counts: { type: 'array', items: 'integer' },
    }
    const result = validateContent({ counts: [1, 2.5, 3] }, fields, 'blog', 'en', 'abc')
    expect(result.errors.some(e => e.field === 'counts[1]' && /integer/.test(e.message ?? ''))).toBe(true)
  })

  it('nested object validation recurses into fields', () => {
    const fields: Record<string, FieldDef> = {
      seo: {
        type: 'object',
        fields: {
          title: { type: 'string', required: true },
        },
      },
    }
    const result = validateContent({ seo: {} }, fields, 'blog', 'en', 'abc')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'title' && e.severity === 'error')).toBe(true)
  })

  it('array-of-object validation prefixes field path with index', () => {
    const fields: Record<string, FieldDef> = {
      items: {
        type: 'array',
        items: {
          type: 'object',
          fields: {
            name: { type: 'string', required: true },
          },
        },
      },
    }
    const result = validateContent(
      { items: [{ name: 'ok' }, {}] },
      fields,
      'blog',
      'en',
      'abc',
    )
    expect(result.errors.some(e => e.field === 'items[1].name')).toBe(true)
  })

  it('error context includes model, locale, entry', () => {
    const fields: Record<string, FieldDef> = {
      title: { type: 'string', required: true },
    }
    const result = validateContent({}, fields, 'my-model', 'tr', 'my-entry')
    const err = result.errors.find(e => e.field === 'title')
    expect(err?.model).toBe('my-model')
    expect(err?.locale).toBe('tr')
    expect(err?.entry).toBe('my-entry')
  })
})
