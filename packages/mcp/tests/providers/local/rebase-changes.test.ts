import { describe, expect, it } from 'vitest'
import { canonicalStringify } from '../../../src/core/serialization/index.js'
import { rebaseChange } from '../../../src/providers/local/rebase-changes.js'

/**
 * Pure tests for the three-way carry-over that keeps a local write from
 * replacing files with a copy built from a stale working tree (#226).
 * basis = what the planner read, planned = the change, current = the tip the
 * commit is built on.
 */

const CONTENT = '.contentrain/content/test/faq/en.json'
const json = (value: unknown) => canonicalStringify(value)

describe('rebaseChange', () => {
  it('writes the plan verbatim when the tip still matches what the planner read', () => {
    const basis = json({ a: { q: 'A' } })
    const planned = json({ a: { q: 'A' }, b: { q: 'B' } })
    expect(rebaseChange({ path: CONTENT, content: planned }, basis, basis))
      .toEqual({ ok: true, change: { path: CONTENT, content: planned } })
  })

  it('keeps an entry another writer added — the #226 data loss', () => {
    const basis = json({ a: { q: 'A' } })
    const planned = json({ a: { q: 'A' }, mine: { q: 'Mine' } })
    const current = json({ a: { q: 'A' }, studio: { q: 'Studio' } })

    const result = rebaseChange({ path: CONTENT, content: planned }, basis, current)

    expect(result).toEqual({
      ok: true,
      change: { path: CONTENT, content: json({ a: { q: 'A' }, mine: { q: 'Mine' }, studio: { q: 'Studio' } }) },
    })
  })

  it('merges edits to different fields of the same entry', () => {
    const basis = json({ a: { q: 'A', answer: 'old' } })
    const planned = json({ a: { q: 'A2', answer: 'old' } })
    const current = json({ a: { q: 'A', answer: 'new' } })

    const result = rebaseChange({ path: CONTENT, content: planned }, basis, current)

    expect(result).toEqual({ ok: true, change: { path: CONTENT, content: json({ a: { q: 'A2', answer: 'new' } }) } })
  })

  it('applies a key deletion without resurrecting or dropping the other writer\'s keys', () => {
    const basis = json({ a: 'A', gone: 'x' })
    const planned = json({ a: 'A' })
    const current = json({ a: 'A', gone: 'x', added: 'y' })

    const result = rebaseChange({ path: CONTENT, content: planned }, basis, current)

    expect(result).toEqual({ ok: true, change: { path: CONTENT, content: json({ a: 'A', added: 'y' }) } })
  })

  it('creates a file the planner did not see, merging with one another writer created meanwhile', () => {
    const planned = json({ mine: 'M' })
    const current = json({ theirs: 'T' })

    const result = rebaseChange({ path: CONTENT, content: planned }, null, current)

    expect(result).toEqual({ ok: true, change: { path: CONTENT, content: json({ mine: 'M', theirs: 'T' }) } })
  })

  it('refuses when both sides changed the same value', () => {
    const basis = json({ a: { q: 'A' } })
    const planned = json({ a: { q: 'Mine' } })
    const current = json({ a: { q: 'Theirs' } })

    const result = rebaseChange({ path: CONTENT, content: planned }, basis, current)

    expect(result).toEqual({
      ok: false,
      path: CONTENT,
      reason: '"a" (field "q") was changed both by this write and on the contentrain branch',
    })
  })

  it('refuses when the file was deleted on the tip since it was read', () => {
    const result = rebaseChange({ path: CONTENT, content: json({ a: 1, b: 2 }) }, json({ a: 1 }), null)
    expect(result).toMatchObject({ ok: false, reason: 'the file was deleted on the contentrain branch since it was read' })
  })

  it('refuses to delete a file that gained entries meanwhile', () => {
    const result = rebaseChange({ path: CONTENT, content: null }, json({ a: 1 }), json({ a: 1, studio: 2 }))
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('gained entries') })
  })

  it('deletes when the other writer only touched keys this delete removes anyway', () => {
    const result = rebaseChange({ path: CONTENT, content: null }, json({ a: 1, b: 2 }), json({ a: 1 }))
    expect(result).toEqual({ ok: true, change: { path: CONTENT, content: null } })
  })

  it('refuses a markdown document that changed on the tip', () => {
    const path = '.contentrain/content/test/blog/en/hello.md'
    const result = rebaseChange({ path, content: '---\ntitle: Mine\n---\n' }, '---\ntitle: A\n---\n', '---\ntitle: Theirs\n---\n')
    expect(result).toMatchObject({ ok: false, path, reason: expect.stringContaining('only JSON files') })
  })

  it('is a no-op when the tip already holds exactly the planned content', () => {
    const planned = json({ a: 'A', b: 'B' })
    expect(rebaseChange({ path: CONTENT, content: planned }, json({ a: 'A' }), planned))
      .toEqual({ ok: true, change: { path: CONTENT, content: planned } })
  })

  it('keeps model definitions in model field order when merging', () => {
    const path = '.contentrain/models/faq.json'
    const basis = canonicalStringify({ id: 'faq', name: 'FAQ', kind: 'collection', fields: { q: { type: 'string' } } })
    const planned = JSON.stringify({ id: 'faq', name: 'FAQ', kind: 'collection', fields: { q: { type: 'string' }, a: { type: 'text' } } })
    const current = canonicalStringify({ id: 'faq', name: 'Questions', kind: 'collection', fields: { q: { type: 'string' } } })

    const result = rebaseChange({ path, content: planned }, basis, current)

    expect(result.ok).toBe(true)
    const content = (result as { change: { content: string } }).change.content
    expect(Object.keys(JSON.parse(content))).toEqual(['id', 'name', 'kind', 'fields'])
    expect(JSON.parse(content)).toEqual({ id: 'faq', name: 'Questions', kind: 'collection', fields: { a: { type: 'text' }, q: { type: 'string' } } })
  })

  describe('meta files', () => {
    const META = '.contentrain/meta/faq/en.json'

    it('lets this write\'s stamp win when both sides stamped the same entry', () => {
      const basis = json({ e1: { status: 'draft', source: 'agent', updated_by: 'contentrain-mcp', updated_at: '2026-01-01T00:00:00.000Z' } })
      const planned = json({ e1: { status: 'draft', source: 'agent', updated_by: 'contentrain-mcp', updated_at: '2026-09-23T10:00:00.000Z' } })
      const current = json({ e1: { status: 'draft', source: 'studio', updated_by: 'editor@studio', updated_at: '2026-09-23T09:00:00.000Z' } })

      const result = rebaseChange({ path: META, content: planned }, basis, current)

      expect(result).toEqual({ ok: true, change: { path: META, content: planned } })
    })

    it('still keeps the other writer\'s status change when only this write stamped', () => {
      const basis = json({ e1: { status: 'draft', updated_at: 'T0' } })
      const planned = json({ e1: { status: 'draft', updated_at: 'T2' } })
      const current = json({ e1: { status: 'published', updated_at: 'T1' } })

      const result = rebaseChange({ path: META, content: planned }, basis, current)

      expect(result).toEqual({ ok: true, change: { path: META, content: json({ e1: { status: 'published', updated_at: 'T2' } }) } })
    })

    it('refuses when both sides changed the status', () => {
      const basis = json({ e1: { status: 'draft', updated_at: 'T0' } })
      const planned = json({ e1: { status: 'archived', updated_at: 'T2' } })
      const current = json({ e1: { status: 'published', updated_at: 'T1' } })

      expect(rebaseChange({ path: META, content: planned }, basis, current))
        .toMatchObject({ ok: false, reason: '"e1" (field "status") was changed both by this write and on the contentrain branch' })
    })

    it('does not extend the stamp rule to content files', () => {
      const basis = json({ e1: { source: 'a' } })
      expect(rebaseChange({ path: CONTENT, content: json({ e1: { source: 'b' } }) }, basis, json({ e1: { source: 'c' } })))
        .toMatchObject({ ok: false })
    })

    it('stamps a flat (singleton / dictionary) meta file the same way', () => {
      const path = '.contentrain/meta/hero/en.json'
      const result = rebaseChange(
        { path, content: json({ status: 'draft', updated_at: 'T2' }) },
        json({ status: 'draft', updated_at: 'T0' }),
        json({ status: 'draft', updated_at: 'T1' }),
      )
      expect(result).toEqual({ ok: true, change: { path, content: json({ status: 'draft', updated_at: 'T2' }) } })
    })
  })

  it('merges dictionary keys added on both sides', () => {
    const path = '.contentrain/content/test/ui-strings/en.json'
    const result = rebaseChange({ path, content: json({ 'a.b': 'A', 'mine.key': 'M' }) }, json({ 'a.b': 'A' }), json({ 'a.b': 'A', 'theirs.key': 'T' }))
    expect(result).toEqual({ ok: true, change: { path, content: json({ 'a.b': 'A', 'mine.key': 'M', 'theirs.key': 'T' }) } })
  })

  it('merges singleton fields changed on different sides', () => {
    const path = '.contentrain/content/marketing/hero/en.json'
    const result = rebaseChange({ path, content: json({ title: 'Mine', subtitle: 'S' }) }, json({ title: 'T', subtitle: 'S' }), json({ title: 'T', subtitle: 'Theirs' }))
    expect(result).toEqual({ ok: true, change: { path, content: json({ title: 'Mine', subtitle: 'Theirs' }) } })
  })

  it('treats arrays as atomic: one side\'s change is taken, both changing differently conflicts', () => {
    const basis = json({ a: { tags: ['x'] } })
    expect(rebaseChange({ path: CONTENT, content: json({ a: { tags: ['x', 'y'] }, b: 1 }) }, basis, json({ a: { tags: ['x'] }, c: 2 })))
      .toEqual({ ok: true, change: { path: CONTENT, content: json({ a: { tags: ['x', 'y'] }, b: 1, c: 2 }) } })
    expect(rebaseChange({ path: CONTENT, content: json({ a: { tags: ['x', 'y'] } }) }, basis, json({ a: { tags: ['z'] } })))
      .toMatchObject({ ok: false, reason: expect.stringContaining('"a" (field "tags")') })
  })

  it('treats a null value as an absent key, as the serializer does', () => {
    const basis = JSON.stringify({ a: { q: 'A', note: null } })
    const planned = json({ a: { q: 'A2' } })
    const current = json({ a: { q: 'A' }, b: { q: 'B' } })
    expect(rebaseChange({ path: CONTENT, content: planned }, basis, current))
      .toEqual({ ok: true, change: { path: CONTENT, content: json({ a: { q: 'A2' }, b: { q: 'B' } }) } })
  })
})
