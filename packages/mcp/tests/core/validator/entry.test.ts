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
    // Items now share the scalar rule set, so the message is validateFieldValue's.
    // The path still names the offending index.
    expect(result.errors.some(e => e.field === 'keywords[1]' && /expected string/.test(e.message ?? ''))).toBe(true)
  })

  it('array of integers rejects float', () => {
    const fields: Record<string, FieldDef> = {
      counts: { type: 'array', items: 'integer' },
    }
    const result = validateContent({ counts: [1, 2.5, 3] }, fields, 'blog', 'en', 'abc')
    expect(result.errors.some(e => e.field === 'counts[1]' && /integer/.test(e.message ?? ''))).toBe(true)
  })

  // Array items used to run through a parallel type switch that knew 10 of the 27
  // field types and checked only `typeof`. They now share the scalar rule set.
  describe('array items share the scalar rule set', () => {
    it('applies the email heuristic to items, not just scalars', () => {
      // The reported case: items:'email' accepted anything string-shaped.
      const fields: Record<string, FieldDef> = {
        emails: { type: 'array', items: 'email' },
      }
      const result = validateContent({ emails: ['not-an-email'] }, fields, 'blog', 'en', 'abc')
      expect(result.errors.some(e => e.field === 'emails[0]' && e.severity === 'warning')).toBe(true)
    })

    it('validates a type the old item switch never knew', () => {
      const fields: Record<string, FieldDef> = {
        published: { type: 'array', items: 'date' },
      }
      const result = validateContent({ published: ['2026-07-15', 'yesterday'] }, fields, 'blog', 'en', 'abc')
      expect(result.errors.some(e => e.field === 'published[1]' && e.severity === 'error')).toBe(true)
      expect(result.errors.some(e => e.field === 'published[0]')).toBe(false)
    })

    it('enforces constraints on an items FieldDef — the old black hole', () => {
      // `items` as a FieldDef with a non-object type matched no branch at all.
      const fields: Record<string, FieldDef> = {
        codes: { type: 'array', items: { type: 'string', max: 3, pattern: '^[a-z]+$' } },
      }
      const result = validateContent({ codes: ['ok', 'toolong', 'AB'] }, fields, 'blog', 'en', 'abc')
      expect(result.errors.some(e => e.field === 'codes[1]' && /maximum/.test(e.message ?? ''))).toBe(true)
      expect(result.errors.some(e => e.field === 'codes[2]' && /pattern/.test(e.message ?? ''))).toBe(true)
      expect(result.errors.some(e => e.field === 'codes[0]')).toBe(false)
    })

    it('enforces select options on items', () => {
      const fields: Record<string, FieldDef> = {
        sizes: { type: 'array', items: { type: 'select', options: ['s', 'm', 'l'] } },
      }
      const result = validateContent({ sizes: ['m', 'xxl'] }, fields, 'blog', 'en', 'abc')
      expect(result.errors.some(e => e.field === 'sizes[1]' && e.severity === 'error')).toBe(true)
    })

    it('bounds runaway nesting instead of blowing the stack', () => {
      let items: FieldDef = { type: 'string' }
      for (let i = 0; i < 15; i++) items = { type: 'array', items }
      let value: unknown = 'x'
      for (let i = 0; i < 15; i++) value = [value]

      const result = validateContent({ deep: value }, { deep: items }, 'blog', 'en', 'abc')
      expect(result.errors.some(e => /nesting depth/.test(e.message ?? ''))).toBe(true)
    })
  })

  // 17 of 27 types were pure typeof checks. Mechanical rules are errors; heuristics
  // are warnings, because a legitimate value can sit outside an approximate pattern.
  describe('semantic type rules', () => {
    it('rejects a slug field that is not a slug', () => {
      // Every shipped template declares slug: { type: 'slug', ... }.
      const result = validateContent(
        { slug: 'Hello World!!' }, { slug: { type: 'slug' } }, 'blog', 'en', 'abc',
      )
      expect(result.errors.some(e => e.field === 'slug' && e.severity === 'error')).toBe(true)
      expect(result.valid).toBe(false)
    })

    it('accepts a well-formed slug', () => {
      const result = validateContent(
        { slug: 'hello-world-2' }, { slug: { type: 'slug' } }, 'blog', 'en', 'abc',
      )
      expect(result.errors).toEqual([])
    })

    it('rejects a float in an integer scalar — matching the array-item rule', () => {
      // The scalar path lumped integer with number, so 3.7 passed here while the
      // identical value was rejected inside an array.
      const result = validateContent(
        { count: 3.7 }, { count: { type: 'integer' } }, 'blog', 'en', 'abc',
      )
      expect(result.errors.some(e => e.field === 'count' && e.severity === 'error')).toBe(true)
    })

    it('rejects unparseable date and datetime', () => {
      const fields: Record<string, FieldDef> = {
        on: { type: 'date' },
        at: { type: 'datetime' },
      }
      const result = validateContent({ on: '15/07/2026', at: 'not-a-time' }, fields, 'blog', 'en', 'abc')
      expect(result.errors.some(e => e.field === 'on' && e.severity === 'error')).toBe(true)
      expect(result.errors.some(e => e.field === 'at' && e.severity === 'error')).toBe(true)
    })

    it('accepts valid date and datetime', () => {
      const fields: Record<string, FieldDef> = {
        on: { type: 'date' },
        at: { type: 'datetime' },
      }
      const result = validateContent(
        { on: '2026-07-15', at: '2026-07-15T14:08:34.746Z' }, fields, 'blog', 'en', 'abc',
      )
      expect(result.errors).toEqual([])
    })

    it('rejects a percent outside 0-100', () => {
      const result = validateContent(
        { pct: 140 }, { pct: { type: 'percent' } }, 'blog', 'en', 'abc',
      )
      expect(result.errors.some(e => e.field === 'pct' && e.severity === 'error')).toBe(true)
    })

    it('warns — never errors — on a heuristic colour check', () => {
      const result = validateContent(
        { brand: 'not a colour' }, { brand: { type: 'color' } }, 'blog', 'en', 'abc',
      )
      expect(result.errors.some(e => e.field === 'brand' && e.severity === 'warning')).toBe(true)
      // A heuristic must not fail the entry.
      expect(result.valid).toBe(true)
    })

    it('accepts the colour forms an author actually writes', () => {
      const fields: Record<string, FieldDef> = {
        a: { type: 'color' }, b: { type: 'color' }, c: { type: 'color' }, d: { type: 'color' },
      }
      const result = validateContent(
        { a: '#fff', b: '#1a2b3c', c: 'rgb(1, 2, 3)', d: 'rebeccapurple' }, fields, 'blog', 'en', 'abc',
      )
      expect(result.errors).toEqual([])
    })

    it('leaves rating alone — its scale is never declared', () => {
      const result = validateContent(
        { stars: 42 }, { stars: { type: 'rating' } }, 'blog', 'en', 'abc',
      )
      expect(result.errors).toEqual([])
    })
  })

  describe('accept on media fields', () => {
    it('warns when the extension contradicts accept, and says it is a sniff', () => {
      // The reported case: accept:"image/jpeg" with a .webp value.
      const fields: Record<string, FieldDef> = {
        cover: { type: 'image', accept: 'image/jpeg' },
      }
      const result = validateContent({ cover: 'media/original/a.webp' }, fields, 'blog', 'en', 'abc')
      const issue = result.errors.find(e => e.field === 'cover')
      expect(issue?.severity).toBe('warning')
      expect(issue?.message).toContain('extension check')
      expect(result.valid).toBe(true)
    })

    it('accepts a matching extension and a wildcard', () => {
      const fields: Record<string, FieldDef> = {
        a: { type: 'image', accept: 'image/jpeg' },
        b: { type: 'image', accept: 'image/*' },
        c: { type: 'file', accept: '.pdf' },
      }
      const result = validateContent(
        { a: 'media/x.jpg', b: 'media/y.webp', c: 'media/z.pdf' }, fields, 'blog', 'en', 'abc',
      )
      expect(result.errors).toEqual([])
    })

    it('stays silent on an extension it cannot map to a MIME type', () => {
      // An unknown extension is not evidence of a violation.
      const fields: Record<string, FieldDef> = {
        cover: { type: 'image', accept: 'image/jpeg' },
      }
      const result = validateContent({ cover: 'media/original/a.heic' }, fields, 'blog', 'en', 'abc')
      expect(result.errors).toEqual([])
    })
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
    // The path is qualified by its parent — a bare `title` would be ambiguous with
    // a top-level field of the same name.
    expect(result.errors.some(e => e.field === 'seo.title' && e.severity === 'error')).toBe(true)
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

  it('single-target relations accept string id arrays', () => {
    const fields: Record<string, FieldDef> = {
      tags: { type: 'relations', model: 'tag' },
    }
    const result = validateContent({ tags: ['t1', 't2'] }, fields, 'post', 'en', 'p1')
    expect(result.errors.filter(e => e.field?.startsWith('tags'))).toEqual([])
  })

  it('polymorphic relations accept { model, ref } items (matches generated type)', () => {
    const fields: Record<string, FieldDef> = {
      blocks: { type: 'relations', model: ['blog-post', 'page'] },
    }
    const ok = validateContent(
      { blocks: [{ model: 'blog-post', ref: 'a1' }, { model: 'page', ref: 'p2' }] },
      fields, 'home', 'en', 'h1',
    )
    expect(ok.errors.filter(e => e.field?.startsWith('blocks'))).toEqual([])

    // A plain string is invalid for a polymorphic multi-relation
    const bad = validateContent({ blocks: ['a1'] }, fields, 'home', 'en', 'h1')
    expect(bad.errors.some(e => e.field === 'blocks[0]' && e.severity === 'error')).toBe(true)

    // An item targeting a model outside the union is rejected
    const wrong = validateContent(
      { blocks: [{ model: 'author', ref: 'x' }] },
      fields, 'home', 'en', 'h1',
    )
    expect(wrong.errors.some(e => e.field === 'blocks[0]' && e.message.includes('must be one of'))).toBe(true)
  })
})
