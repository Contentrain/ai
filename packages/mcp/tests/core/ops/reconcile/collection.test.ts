import { describe, expect, it } from 'vitest'
import { FAQ_EN, contentChanges, entries, project, reconcile } from './helpers.js'

const BASE = project({
  [FAQ_EN]: entries({
    'faq-1': { question: 'What is it?', answer: 'A CMS.' },
    'faq-2': { question: 'Is it free?', answer: 'Yes.' },
  }),
})

describe('planReconcile — collection entries', () => {
  it('a theirs-only entry edit wins and lands as a change', async () => {
    const theirs = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'A git-native CMS.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
      }),
    })
    const plan = await reconcile({ base: BASE, ours: BASE, theirs })
    expect(plan.conflicts).toEqual([])
    expect(plan.result.entries_taken_theirs).toBe(1)
    const change = contentChanges(plan).find(c => c.path === FAQ_EN)
    expect(change).toBeDefined()
    expect(JSON.parse(change!.content!)['faq-1'].answer).toBe('A git-native CMS.')
  })

  it('an ours-only edit produces NO change — the output already is ours', async () => {
    const ours = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'Edited on contentrain.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
      }),
    })
    const plan = await reconcile({ base: BASE, ours, theirs: BASE })
    expect(plan.conflicts).toEqual([])
    expect(contentChanges(plan)).toEqual([])
    expect(plan.result.entries_taken_ours).toBe(1)
    expect(plan.result.regenerated).toEqual([])
  })

  it('identical changes on both sides converge without a conflict', async () => {
    const edited = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'Same on both.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
      }),
    })
    const plan = await reconcile({ base: BASE, ours: edited, theirs: edited })
    expect(plan.conflicts).toEqual([])
    expect(contentChanges(plan)).toEqual([])
  })

  it('different fields of the same entry merge as a union', async () => {
    const ours = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What exactly is it?', answer: 'A CMS.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
      }),
    })
    const theirs = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'A git-native CMS.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
      }),
    })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    expect(plan.result.entries_field_merged).toBe(1)
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === FAQ_EN)!.content!)
    expect(merged['faq-1']).toEqual({ question: 'What exactly is it?', answer: 'A git-native CMS.' })
  })

  it('the same field with two values is one conflict, ours kept, id stable', async () => {
    const ours = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'Ours answer.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
      }),
    })
    const theirs = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'Theirs answer.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
      }),
    })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    const conflict = plan.conflicts[0]!
    expect(conflict.code).toBe('field_value_conflict')
    expect(conflict.kind).toBe('collection')
    expect(conflict.key).toBe('faq-1')
    expect(conflict.field).toBe('answer')
    expect(conflict.ours).toBe('Ours answer.')
    expect(conflict.theirs).toBe('Theirs answer.')
    // Unresolved conflict never overwrites ours.
    expect(contentChanges(plan).find(c => c.path === FAQ_EN)).toBeUndefined()

    const again = await reconcile({ base: BASE, ours, theirs })
    expect(again.conflicts[0]!.id).toBe(conflict.id)
  })

  it('entries added on both sides with different ids both win', async () => {
    const ours = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'A CMS.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
        'faq-ours': { question: 'From ours?', answer: 'Yes.' },
      }),
    })
    const theirs = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'A CMS.' },
        'faq-2': { question: 'Is it free?', answer: 'Yes.' },
        'faq-theirs': { question: 'From theirs?', answer: 'Yes.' },
      }),
    })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === FAQ_EN)!.content!)
    expect(Object.keys(merged).toSorted()).toEqual(['faq-1', 'faq-2', 'faq-ours', 'faq-theirs'])
  })

  it('entry deleted on one side and edited on the other is a delete_edit conflict', async () => {
    const ours = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'A CMS.' },
      }),
    })
    const theirs = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'A CMS.' },
        'faq-2': { question: 'Is it free?', answer: 'Forever free.' },
      }),
    })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.code).toBe('delete_edit_conflict')
    expect(plan.conflicts[0]!.key).toBe('faq-2')
  })

  it('an entry deleted on one side only disappears; the file is rewritten, not deleted', async () => {
    const theirs = project({
      [FAQ_EN]: entries({
        'faq-1': { question: 'What is it?', answer: 'A CMS.' },
      }),
    })
    const plan = await reconcile({ base: BASE, ours: BASE, theirs })
    expect(plan.conflicts).toEqual([])
    const change = contentChanges(plan).find(c => c.path === FAQ_EN)
    expect(change).toBeDefined()
    expect(change!.content).not.toBeNull()
    expect(JSON.parse(change!.content!)).toEqual({ 'faq-1': { question: 'What is it?', answer: 'A CMS.' } })
  })
})
