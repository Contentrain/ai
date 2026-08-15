import { describe, expect, it } from 'vitest'
import type { Files } from './helpers.js'
import { CONFIG, contentChanges, reconcile } from './helpers.js'

const DICT_MODEL = JSON.stringify({
  id: 'ui-strings',
  name: 'UI Strings',
  kind: 'dictionary',
  domain: 'site',
  i18n: true,
  title_field: 'key',
})
const DICT_EN = '.contentrain/content/site/ui-strings/en.json'

function dictProject(files: Files): Files {
  return {
    '.contentrain/config.json': CONFIG,
    '.contentrain/models/ui-strings.json': DICT_MODEL,
    ...files,
  }
}

const SINGLETON_MODEL = JSON.stringify({
  id: 'settings',
  name: 'Settings',
  kind: 'singleton',
  domain: 'site',
  i18n: false,
  title_field: 'title',
  fields: { title: { type: 'text' }, tagline: { type: 'text' } },
})
const SETTINGS = '.contentrain/content/site/settings/data.json'

function singletonProject(files: Files): Files {
  return {
    '.contentrain/config.json': CONFIG,
    '.contentrain/models/settings.json': SINGLETON_MODEL,
    ...files,
  }
}

describe('planReconcile — dictionary', () => {
  const BASE = dictProject({ [DICT_EN]: JSON.stringify({ greeting: 'Hello', farewell: 'Goodbye' }) })

  it('different keys changed on each side both win', async () => {
    const ours = dictProject({ [DICT_EN]: JSON.stringify({ greeting: 'Hi there', farewell: 'Goodbye' }) })
    const theirs = dictProject({ [DICT_EN]: JSON.stringify({ greeting: 'Hello', farewell: 'See you' }) })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === DICT_EN)!.content!)
    expect(merged).toEqual({ greeting: 'Hi there', farewell: 'See you' })
  })

  it('the same key with two values is a dictionary_value_conflict', async () => {
    const ours = dictProject({ [DICT_EN]: JSON.stringify({ greeting: 'Hi (ours)', farewell: 'Goodbye' }) })
    const theirs = dictProject({ [DICT_EN]: JSON.stringify({ greeting: 'Hi (theirs)', farewell: 'Goodbye' }) })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.code).toBe('dictionary_value_conflict')
    expect(plan.conflicts[0]!.key).toBe('greeting')
    expect(plan.conflicts[0]!.kind).toBe('dictionary')
  })
})

describe('planReconcile — singleton', () => {
  const BASE = singletonProject({ [SETTINGS]: JSON.stringify({ title: 'Site', tagline: 'Plain words' }) })

  it('merges field-wise like a single entry', async () => {
    const ours = singletonProject({ [SETTINGS]: JSON.stringify({ title: 'Contentrain', tagline: 'Plain words' }) })
    const theirs = singletonProject({ [SETTINGS]: JSON.stringify({ title: 'Site', tagline: 'Git-native words' }) })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = JSON.parse(contentChanges(plan).find(c => c.path === SETTINGS)!.content!)
    expect(merged).toEqual({ title: 'Contentrain', tagline: 'Git-native words' })
  })

  it('the same field both-changed conflicts with ours kept', async () => {
    const ours = singletonProject({ [SETTINGS]: JSON.stringify({ title: 'Ours', tagline: 'Plain words' }) })
    const theirs = singletonProject({ [SETTINGS]: JSON.stringify({ title: 'Theirs', tagline: 'Plain words' }) })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.code).toBe('field_value_conflict')
    expect(plan.conflicts[0]!.kind).toBe('singleton')
    expect(contentChanges(plan).find(c => c.path === SETTINGS)).toBeUndefined()
  })
})
