import type { EntryMeta } from '@contentrain/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyStatusChange, mergeEntryMeta } from '../../src/core/meta-manager.js'

/**
 * `updated_at` exists so "sort by last edited" is answerable. It is stamped,
 * never backfilled: an entry written before the field existed has no
 * recoverable value, and inventing one would be worse than leaving it absent,
 * because an invented timestamp sorts.
 *
 * Two functions mint entry meta, and both stamp. Before this, four more places
 * built the object by hand — a timestamp added to each would have been forgotten
 * by the fifth.
 */

const AT = new Date('2026-03-04T05:06:07.000Z')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(AT)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mergeEntryMeta', () => {
  it('stamps a new entry', () => {
    expect(mergeEntryMeta(undefined).updated_at).toBe(AT.toISOString())
  })

  it('restamps an existing entry', () => {
    const existing: EntryMeta = {
      status: 'published',
      source: 'human',
      updated_by: 'ada',
      updated_at: '2020-01-01T00:00:00.000Z',
    }
    expect(mergeEntryMeta(existing).updated_at).toBe(AT.toISOString())
  })

  it('stamps an entry that predates the field', () => {
    const legacy = { status: 'published', source: 'human', updated_by: 'ada' } as EntryMeta
    expect(mergeEntryMeta(legacy).updated_at).toBe(AT.toISOString())
  })

  it('leaves the fields it never owned alone', () => {
    const existing: EntryMeta = {
      status: 'published',
      source: 'human',
      updated_by: 'ada',
      approved_by: 'grace',
      version: '3',
      publish_at: '2026-01-01T00:00:00.000Z',
      expire_at: '2027-01-01T00:00:00.000Z',
    }
    expect(mergeEntryMeta(existing)).toMatchObject({
      status: 'published',
      approved_by: 'grace',
      version: '3',
      publish_at: '2026-01-01T00:00:00.000Z',
      expire_at: '2027-01-01T00:00:00.000Z',
    })
  })

  // Editing a field must not unpublish an entry — the pre-existing rule.
  it('still refuses to touch status', () => {
    const existing: EntryMeta = { status: 'published', source: 'human', updated_by: 'ada' }
    expect(mergeEntryMeta(existing).status).toBe('published')
    expect(mergeEntryMeta(undefined).status).toBe('draft')
  })
})

describe('applyStatusChange', () => {
  const existing: EntryMeta = {
    status: 'draft',
    source: 'human',
    updated_by: 'ada',
    approved_by: 'grace',
    updated_at: '2020-01-01T00:00:00.000Z',
  }

  // The acceptance criterion that motivated splitting this out: a status-only
  // write is a write, and Studio's status picker takes this path.
  it('stamps a status-only change', () => {
    expect(applyStatusChange(existing, 'published').updated_at).toBe(AT.toISOString())
  })

  it('is the one mint allowed to overwrite status', () => {
    expect(applyStatusChange(existing, 'published').status).toBe('published')
  })

  it('keeps everything else', () => {
    expect(applyStatusChange(existing, 'archived')).toMatchObject({
      source: 'human',
      approved_by: 'grace',
    })
  })
})

describe('the stamp is ISO 8601 UTC', () => {
  it('round-trips and carries a Z', () => {
    const stamped = mergeEntryMeta(undefined).updated_at!
    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(new Date(stamped).toISOString()).toBe(stamped)
  })
})
