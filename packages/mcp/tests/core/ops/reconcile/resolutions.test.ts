import { describe, expect, it } from 'vitest'
import type { Files } from './helpers.js'
import { FAQ_EN, contentChanges, entries, project, reconcile } from './helpers.js'

const BASE = project({
  [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'Base answer.' } }),
})
const OURS: Files = {
  ...BASE,
  [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'Ours answer.' } }),
}
const THEIRS: Files = {
  ...BASE,
  [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'Theirs answer.' } }),
}

describe('planReconcile — resolutions (N1 compare-and-set)', () => {
  it('choose: theirs consumes the conflict and the value lands', async () => {
    const dryRun = await reconcile({ base: BASE, ours: OURS, theirs: THEIRS })
    expect(dryRun.conflicts).toHaveLength(1)

    const plan = await reconcile(
      { base: BASE, ours: OURS, theirs: THEIRS },
      [{ id: dryRun.conflicts[0]!.id, choose: 'theirs' }],
    )
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === FAQ_EN)!.content!)
    expect(merged['faq-1'].answer).toBe('Theirs answer.')
  })

  it('a stale id is dropped with an advisory and the conflict re-reported fresh', async () => {
    const dryRun = await reconcile({ base: BASE, ours: OURS, theirs: THEIRS })
    const staleId = dryRun.conflicts[0]!.id

    // Between rounds, an editor saved again on contentrain.
    const oursMoved: Files = {
      ...BASE,
      [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'Ours answer, edited later.' } }),
    }
    const plan = await reconcile(
      { base: BASE, ours: oursMoved, theirs: THEIRS },
      [{ id: staleId, choose: 'theirs' }],
    )
    // The decision was made against values the human never saw — dropped.
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.id).not.toBe(staleId)
    expect(plan.conflicts[0]!.ours).toBe('Ours answer, edited later.')
    expect(plan.advisories.some(a => a.includes(staleId))).toBe(true)
    expect(contentChanges(plan).find(c => c.path === FAQ_EN)).toBeUndefined()
  })

  it('a hand-authored { value } lands verbatim', async () => {
    const dryRun = await reconcile({ base: BASE, ours: OURS, theirs: THEIRS })
    const plan = await reconcile(
      { base: BASE, ours: OURS, theirs: THEIRS },
      [{ id: dryRun.conflicts[0]!.id, value: 'A third, better answer.' }],
    )
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === FAQ_EN)!.content!)
    expect(merged['faq-1'].answer).toBe('A third, better answer.')
  })
})
