import { describe, expect, it } from 'vitest'
import type { Files } from './helpers.js'
import { FAQ_EN, FAQ_TR, contentChanges, entries, project, reconcile } from './helpers.js'

describe('planReconcile — i18n locale files', () => {
  const BASE = project({
    [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'A.' } }),
    [FAQ_TR]: entries({ 'faq-1': { question: 'S?', answer: 'C.' } }),
  })

  it('each side editing a different locale file merges without contact', async () => {
    const ours: Files = { ...BASE, [FAQ_TR]: entries({ 'faq-1': { question: 'Soru?', answer: 'C.' } }) }
    const theirs: Files = { ...BASE, [FAQ_EN]: entries({ 'faq-1': { question: 'Question?', answer: 'A.' } }) }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    // Only the theirs-side EN edit needs a change; ours already holds TR.
    const paths = contentChanges(plan).map(c => c.path)
    expect(paths).toContain(FAQ_EN)
    expect(paths).not.toContain(FAQ_TR)
  })
})

describe('planReconcile — unclaimed files', () => {
  const STRAY = '.contentrain/notes.json'
  const BASE = project({
    [FAQ_EN]: entries({ 'faq-1': { question: 'Q?', answer: 'A.' } }),
    [STRAY]: '{"note":"base"}',
  })

  it('changed on one side only: theirs is carried, ours is left alone', async () => {
    const theirs: Files = { ...BASE, [STRAY]: '{"note":"theirs"}' }
    const plan = await reconcile({ base: BASE, ours: BASE, theirs })
    expect(plan.conflicts).toEqual([])
    expect(contentChanges(plan).find(c => c.path === STRAY)!.content).toBe('{"note":"theirs"}')

    const oursOnly: Files = { ...BASE, [STRAY]: '{"note":"ours"}' }
    const plan2 = await reconcile({ base: BASE, ours: oursOnly, theirs: BASE })
    expect(contentChanges(plan2).find(c => c.path === STRAY)).toBeUndefined()
  })

  it('changed on both sides: a file_conflict with no values shipped', async () => {
    const ours: Files = { ...BASE, [STRAY]: '{"note":"ours"}' }
    const theirs: Files = { ...BASE, [STRAY]: '{"note":"theirs"}' }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    const conflict = plan.conflicts[0]!
    expect(conflict.kind).toBe('file')
    expect(conflict.code).toBe('file_conflict')
    expect(conflict.ours).toBeUndefined()
    expect(conflict.theirs).toBeUndefined()
    expect(contentChanges(plan).find(c => c.path === STRAY)).toBeUndefined()
  })

  // config.json used to land here — an opaque file, so two sides touching two
  // different settings could only be resolved by discarding one of them. It is
  // claimed and merged by top-level key now; see the config.json suite.
  it('config.json is no longer an opaque file: different keys merge', async () => {
    const ours: Files = { ...BASE, '.contentrain/config.json': BASE['.contentrain/config.json']!.replace('"auto-merge"', '"review"') }
    const theirs: Files = { ...BASE, '.contentrain/config.json': BASE['.contentrain/config.json']!.replace('other', 'nuxt') }
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts.some(c => c.path === '.contentrain/config.json')).toBe(false)
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === '.contentrain/config.json')!.content!)
    expect(merged.workflow).toBe('review')
    expect(merged.stack).toBe('nuxt')
  })
})
