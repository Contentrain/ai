import { describe, expect, it } from 'vitest'
import { MODEL_FIELD_ORDER, canonicalStringify } from '@contentrain/types'
import type { Files } from './helpers.js'
import { FAQ_EN, contentChanges, entries, faqModel, project, reconcile } from './helpers.js'

const MODEL_PATH = '.contentrain/models/faq.json'

describe('planReconcile — model definitions', () => {
  const BASE = project({
    [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'A.' } }),
  })

  it('key-level merge: one side renames, the other adds a field — both win', async () => {
    const ours: Files = { ...BASE, [MODEL_PATH]: faqModel({ name: 'FAQ (renamed)' }) }
    const theirs: Files = {
      ...BASE,
      [MODEL_PATH]: faqModel({
        fields: {
          question: { type: 'text', required: true },
          answer: { type: 'text' },
          category: { type: 'text' },
        },
      }),
    }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    const change = contentChanges(plan).find(c => c.path === MODEL_PATH)!
    const merged = JSON.parse(change.content!)
    expect(merged.name).toBe('FAQ (renamed)')
    expect(Object.keys(merged.fields).toSorted()).toEqual(['answer', 'category', 'question'])
    // Canonical serialization with the model field order.
    expect(change.content).toBe(canonicalStringify(merged, MODEL_FIELD_ORDER))
  })

  it('the same key changed differently carries suggested: theirs, never auto-applied', async () => {
    const base: Files = { ...BASE, [MODEL_PATH]: faqModel({ title_field: 'id-like' }) }
    const ours: Files = { ...BASE, [MODEL_PATH]: faqModel({ title_field: 'answer' }) }
    const theirs: Files = { ...BASE, [MODEL_PATH]: faqModel({ title_field: 'question' }) }
    const plan = await reconcile({ base, ours, theirs })
    const conflict = plan.conflicts.find(c => c.key === 'title_field')
    expect(conflict).toBeDefined()
    expect(conflict!.code).toBe('model_key_conflict')
    expect(conflict!.suggested).toBe('theirs')
    // Ours' value stays in the output until resolved.
    expect(contentChanges(plan).find(c => c.path === MODEL_PATH)).toBeUndefined()
  })

  it('model deleted on theirs with untouched content cascades mechanically', async () => {
    const theirs: Files = { '.contentrain/config.json': BASE['.contentrain/config.json']! }
    const withMeta: Files = {
      ...BASE,
      '.contentrain/meta/faq/en.json': JSON.stringify({ 'faq-1': { status: 'draft', source: 'agent', updated_by: 'x' } }),
    }
    const plan = await reconcile({ base: withMeta, ours: withMeta, theirs })
    expect(plan.conflicts).toEqual([])
    const paths = contentChanges(plan).map(c => c.path).toSorted()
    expect(paths).toEqual([
      FAQ_EN,
      '.contentrain/meta/faq/en.json',
      MODEL_PATH,
    ].toSorted())
    for (const change of contentChanges(plan)) expect(change.content).toBeNull()
  })

  it('model deleted on theirs while ours edited content collapses to ONE conflict', async () => {
    const ours: Files = {
      ...BASE,
      [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'Edited after the delete.' } }),
    }
    const theirs: Files = { '.contentrain/config.json': BASE['.contentrain/config.json']! }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    const conflict = plan.conflicts[0]!
    expect(conflict.kind).toBe('model')
    expect(conflict.code).toBe('delete_edit_conflict')
    expect(conflict.model).toBe('faq')
    // Nothing is changed while the single question stands.
    expect(contentChanges(plan)).toEqual([])
  })

  it('a theirs-side content_path move relocates the merged file and deletes the old one', async () => {
    const NEW_PATH = 'content-data/faq/en.json'
    const theirs: Files = {
      '.contentrain/config.json': BASE['.contentrain/config.json']!,
      [MODEL_PATH]: faqModel({ content_path: 'content-data/faq' }),
      [NEW_PATH]: entries({ 'faq-1': { question: 'Q?', answer: 'A.' } }),
    }
    const plan = await reconcile({ base: BASE, ours: BASE, theirs })
    expect(plan.conflicts).toEqual([])
    const paths = contentChanges(plan).map(c => c.path)
    expect(paths).toContain(NEW_PATH)
    expect(paths).toContain(FAQ_EN)
    expect(contentChanges(plan).find(c => c.path === FAQ_EN)!.content).toBeNull()
    expect(JSON.parse(contentChanges(plan).find(c => c.path === NEW_PATH)!.content!)['faq-1'].answer).toBe('A.')
  })

  it('a structural key conflict blocks the content phase entirely', async () => {
    const base: Files = { ...BASE, [MODEL_PATH]: faqModel() }
    const ours: Files = { ...BASE, [MODEL_PATH]: faqModel({ content_path: 'ours-dir' }), 'ours-dir/en.json': BASE[FAQ_EN]! }
    const theirs: Files = { ...BASE, [MODEL_PATH]: faqModel({ content_path: 'theirs-dir' }), 'theirs-dir/en.json': BASE[FAQ_EN]! }
    const plan = await reconcile({ base, ours, theirs })
    const structural = plan.conflicts.find(c => c.key === 'content_path')
    expect(structural).toBeDefined()
    expect(plan.advisories.some(a => a.includes('structural'))).toBe(true)
    // No content output for the blocked model.
    expect(contentChanges(plan).filter(c => c.path.includes('faq') && c.path !== MODEL_PATH)).toEqual([])
  })
})
