import { describe, expect, it } from 'vitest'
import type { Files } from './helpers.js'
import { CONFIG, FAQ_EN, contentChanges, entries, project, reconcile } from './helpers.js'

const META_EN = '.contentrain/meta/faq/en.json'
const VOCAB = '.contentrain/vocabulary.json'
const SOURCES = '.contentrain/normalize-sources.json'

function meta(records: Record<string, Record<string, unknown>>): string {
  return JSON.stringify(records)
}

describe('planReconcile — meta', () => {
  const BASE = project({
    [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'A.' } }),
    [META_EN]: meta({ 'faq-1': { status: 'draft', source: 'agent', updated_by: 'a@x', updated_at: '2026-08-01T00:00:00.000Z' } }),
  })

  it('updated_at takes the max and updated_by follows it', async () => {
    const ours: Files = {
      ...BASE,
      [META_EN]: meta({ 'faq-1': { status: 'draft', source: 'agent', updated_by: 'ours@x', updated_at: '2026-08-10T00:00:00.000Z' } }),
    }
    const theirs: Files = {
      ...BASE,
      [META_EN]: meta({ 'faq-1': { status: 'draft', source: 'agent', updated_by: 'theirs@x', updated_at: '2026-08-12T00:00:00.000Z' } }),
    }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === META_EN)!.content!)
    expect(merged['faq-1'].updated_at).toBe('2026-08-12T00:00:00.000Z')
    expect(merged['faq-1'].updated_by).toBe('theirs@x')
  })

  it('a status moved differently on both sides is a meta_status_conflict', async () => {
    const ours: Files = {
      ...BASE,
      [META_EN]: meta({ 'faq-1': { status: 'published', source: 'agent', updated_by: 'a@x', updated_at: '2026-08-01T00:00:00.000Z' } }),
    }
    const theirs: Files = {
      ...BASE,
      [META_EN]: meta({ 'faq-1': { status: 'archived', source: 'agent', updated_by: 'a@x', updated_at: '2026-08-01T00:00:00.000Z' } }),
    }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.code).toBe('meta_status_conflict')
    expect(plan.conflicts[0]!.kind).toBe('meta')
    expect(plan.conflicts[0]!.field).toBe('status')
  })

  it('a status changed on one side wins mechanically', async () => {
    const theirs: Files = {
      ...BASE,
      [META_EN]: meta({ 'faq-1': { status: 'published', source: 'agent', updated_by: 'a@x', updated_at: '2026-08-01T00:00:00.000Z' } }),
    }
    const plan = await reconcile({ base: BASE, ours: BASE, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === META_EN)!.content!)
    expect(merged['faq-1'].status).toBe('published')
  })
})

describe('planReconcile — non-i18n meta', () => {
  const MODEL = JSON.stringify({
    id: 'settings',
    name: 'Settings',
    kind: 'singleton',
    domain: 'site',
    i18n: false,
    title_field: 'title',
    fields: { title: { type: 'text' } },
  })
  const DATA = '.contentrain/content/site/settings/data.json'
  const META = '.contentrain/meta/settings/en.json'

  it('merges the single default-locale record as one flat entry', async () => {
    const base: Files = {
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/settings.json': MODEL,
      [DATA]: JSON.stringify({ title: 'Site' }),
      [META]: JSON.stringify({ status: 'draft', source: 'agent', updated_by: 'a@x' }),
    }
    const theirs: Files = { ...base, [META]: JSON.stringify({ status: 'published', source: 'agent', updated_by: 'a@x' }) }
    const plan = await reconcile({ base, ours: base, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === META)!.content!)
    // Flat record, NOT keyed by entry id — dispatch came from the model kind.
    expect(merged.status).toBe('published')
  })
})

describe('planReconcile — vocabulary', () => {
  const BASE = project({
    [VOCAB]: JSON.stringify({ version: 1, terms: { brand: { en: 'Contentrain', tr: 'Contentrain' } } }),
  })

  it('term+locale granularity: different locales of the same term both win', async () => {
    const ours: Files = { ...BASE, [VOCAB]: JSON.stringify({ version: 1, terms: { brand: { en: 'Contentrain', tr: 'Contentrain TR' } } }) }
    const theirs: Files = { ...BASE, [VOCAB]: JSON.stringify({ version: 1, terms: { brand: { en: 'Contentrain Inc', tr: 'Contentrain' } } }) }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === VOCAB)!.content!)
    expect(merged.terms.brand).toEqual({ en: 'Contentrain Inc', tr: 'Contentrain TR' })
  })

  it('the same term+locale with two translations is the only vocabulary question', async () => {
    const ours: Files = { ...BASE, [VOCAB]: JSON.stringify({ version: 1, terms: { brand: { en: 'Ours Brand', tr: 'Contentrain' } } }) }
    const theirs: Files = { ...BASE, [VOCAB]: JSON.stringify({ version: 1, terms: { brand: { en: 'Theirs Brand', tr: 'Contentrain' } } }) }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.code).toBe('vocabulary_value_conflict')
    expect(plan.conflicts[0]!.key).toBe('brand')
    expect(plan.conflicts[0]!.locale).toBe('en')
  })
})

describe('planReconcile — normalize-sources', () => {
  it('merges key-based like a dictionary', async () => {
    const base = project({ [SOURCES]: JSON.stringify({ 'faq.q1': ['src/a.vue'] }) })
    const ours = project({ [SOURCES]: JSON.stringify({ 'faq.q1': ['src/a.vue'], 'faq.q2': ['src/b.vue'] }) })
    const theirs = project({ [SOURCES]: JSON.stringify({ 'faq.q1': ['src/a.vue'], 'faq.q3': ['src/c.vue'] }) })
    const plan = await reconcile({ base, ours, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === SOURCES)!.content!)
    expect(Object.keys(merged).toSorted()).toEqual(['faq.q1', 'faq.q2', 'faq.q3'])
  })
})
