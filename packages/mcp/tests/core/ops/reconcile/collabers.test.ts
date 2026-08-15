import { describe, expect, it } from 'vitest'
import type { Files } from './helpers.js'
import { CONFIG, contentChanges, reconcile } from './helpers.js'

/**
 * The golden scenario, modeled on the live incident that produced this
 * feature: a `contentrain 3.x` migration PR landed on main (models change
 * theirs-only — `title_field` added to N models — plus a canonical
 * vocabulary), while editors kept writing content on contentrain
 * (ours-only entry changes) and BOTH sides touched the vocabulary in
 * different locales. Acceptance: ZERO human input; the only conflict shape
 * possible is the same-term-same-locale case, exercised separately.
 */

function model(id: string, withTitleField: boolean): string {
  return JSON.stringify({
    id,
    name: id.toUpperCase(),
    kind: 'collection',
    domain: 'site',
    i18n: true,
    ...(withTitleField ? { title_field: 'title' } : {}),
    fields: { title: { type: 'text', required: true }, body: { type: 'text' } },
  })
}

const CONTENT = (id: string): string => `.contentrain/content/site/${id}/en.json`
const MODELS = ['articles', 'pages', 'faq']

const BASE: Files = {
  '.contentrain/config.json': CONFIG,
  '.contentrain/vocabulary.json': JSON.stringify({ version: 1, terms: { brand: { en: 'Collabers' } } }),
  ...Object.fromEntries(MODELS.map(id => [`.contentrain/models/${id}.json`, model(id, false)])),
  ...Object.fromEntries(MODELS.map(id => [CONTENT(id), JSON.stringify({ e1: { title: `${id} one`, body: 'text' } })])),
}

// theirs = main after the migration PR: every model gains title_field,
// vocabulary gains a Turkish translation of the brand term.
const THEIRS: Files = {
  ...BASE,
  ...Object.fromEntries(MODELS.map(id => [`.contentrain/models/${id}.json`, model(id, true)])),
  '.contentrain/vocabulary.json': JSON.stringify({ version: 1, terms: { brand: { en: 'Collabers', tr: 'Collabers TR' } } }),
}

// ours = contentrain where editors kept working: new entries + an edit,
// and the brand term's ENGLISH copy polished.
const OURS: Files = {
  ...BASE,
  [CONTENT('articles')]: JSON.stringify({
    e1: { title: 'articles one (edited)', body: 'text' },
    e2: { title: 'articles two', body: 'fresh' },
  }),
  '.contentrain/vocabulary.json': JSON.stringify({ version: 1, terms: { brand: { en: 'Collabers Inc' } } }),
}

describe('planReconcile — collabers golden scenario', () => {
  it('resolves the whole divergence with zero conflicts', async () => {
    const plan = await reconcile({ base: BASE, ours: OURS, theirs: THEIRS })

    expect(plan.conflicts).toEqual([])

    const changes = contentChanges(plan)
    const changedPaths = changes.map(c => c.path).toSorted()
    // Model migrations land; vocabulary merges both sides; content stays
    // as ours already has it (no change needed on top of ours).
    expect(changedPaths).toEqual([
      '.contentrain/models/articles.json',
      '.contentrain/models/faq.json',
      '.contentrain/models/pages.json',
      '.contentrain/vocabulary.json',
    ])

    for (const id of MODELS) {
      const merged = JSON.parse(changes.find(c => c.path === `.contentrain/models/${id}.json`)!.content!)
      expect(merged.title_field).toBe('title')
    }
    const vocab = JSON.parse(changes.find(c => c.path === '.contentrain/vocabulary.json')!.content!)
    expect(vocab.terms.brand).toEqual({ en: 'Collabers Inc', tr: 'Collabers TR' })

    // context.json is regenerated exactly once, and the plan says so.
    expect(plan.changes.filter(c => c.path === '.contentrain/context.json')).toHaveLength(1)
    expect(plan.result.regenerated).toEqual(['.contentrain/context.json'])
    expect(plan.result.entries_taken_theirs).toBeGreaterThan(0)
    expect(plan.result.entries_taken_ours).toBeGreaterThan(0)
  })

  it('is deterministic: identical inputs give identical changes and ids', async () => {
    const [a, b] = await Promise.all([
      reconcile({ base: BASE, ours: OURS, theirs: THEIRS }),
      reconcile({ base: BASE, ours: OURS, theirs: THEIRS }),
    ])
    expect(contentChanges(a)).toEqual(contentChanges(b))
    expect(a.conflicts.map(c => c.id)).toEqual(b.conflicts.map(c => c.id))
  })

  it('a fully converged input is a total no-op', async () => {
    const plan = await reconcile({ base: BASE, ours: BASE, theirs: BASE })
    expect(plan.changes).toEqual([])
    expect(plan.conflicts).toEqual([])
    expect(plan.result.regenerated).toEqual([])
    expect(plan.advisories.some(a => a.includes('already reconciled'))).toBe(true)
  })
})
