import type { ModelDefinition } from '@contentrain/types'
import { MODEL_FIELD_ORDER } from '@contentrain/types'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeModel } from '../src/core/model-manager.js'
import { planModelSave } from '../src/core/ops/model-save.js'
import type { RepoReader } from '../src/core/contracts/index.js'

/**
 * A model with every key populated — the only shape that can prove the two write
 * paths agree on all of them.
 */
const FULL_MODEL: ModelDefinition = {
  id: 'every-key',
  name: 'Every Key',
  kind: 'collection',
  domain: 'test',
  i18n: true,
  title_field: 'title',
  description: 'Exercises every ModelDefinition key.',
  content_path: 'content/every-key',
  locale_strategy: 'suffix',
  fields: {
    title: { type: 'string', required: true },
    body: { type: 'text' },
  },
}

/** Reader that reports every path as absent, so planModelSave takes the 'created' branch. */
const absentReader = {
  readFile: () => Promise.reject(new Error('ENOENT')),
} as unknown as RepoReader

describe('MODEL_FIELD_ORDER', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cr-model-field-order-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  // The invariant that actually matters. Asserting the two former constants were
  // equal only held while two constants existed; this holds however the order is
  // sourced, and fails the moment the local-fs writer and the plan/apply writer
  // disagree about a single byte.
  it('writeModel and planModelSave produce byte-identical model JSON', async () => {
    await writeModel(root, FULL_MODEL)
    const viaWriteModel = await readFile(join(root, '.contentrain/models/every-key.json'), 'utf-8')

    const plan = await planModelSave(absentReader, { model: FULL_MODEL })

    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]!.path).toBe('.contentrain/models/every-key.json')
    expect(plan.changes[0]!.content).toBe(viaWriteModel)
  })

  it('serializes keys in the canonical order, with title_field after i18n', async () => {
    await writeModel(root, FULL_MODEL)
    const raw = await readFile(join(root, '.contentrain/models/every-key.json'), 'utf-8')

    expect(Object.keys(JSON.parse(raw) as Record<string, unknown>)).toEqual([...MODEL_FIELD_ORDER])
  })

  // Runtime mirror of the `keyof ModelDefinition` assertion in @contentrain/types.
  // A key absent from the order does not throw — canonicalStringify silently falls
  // back to alphabetical — so an explicit check is the only way to see it.
  it('covers every key of a fully-populated model', () => {
    const uncovered = Object.keys(FULL_MODEL).filter(k => !MODEL_FIELD_ORDER.includes(k as never))
    expect(uncovered).toEqual([])
  })
})
