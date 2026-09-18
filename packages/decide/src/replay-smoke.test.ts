// Replay smoke tests: recorded answers through the whole decider.
//
// These check the code path — shaping, grouping, batching, reading, scoring —
// and nothing else. A replay hands back answers a model gave once, so it
// cannot say how Jev answers today; that is `pnpm calibration:live`, whose
// result is committed under calibration/ and pinned by request-shape.test.ts.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadPoc1 } from '../scripts/poc1.mjs'
import { createReplayFetch, measurePunchCalibration, stableChoices } from './calibration.js'
import type { PunchLabel, RecordedCase } from './calibration.js'
import { createDecider } from './decide.js'
import { JEV_TOKEN_ENV, createJevProvider } from './jev.js'
import { punchItem } from './kinds/punch-item.js'
import type { PunchItemInput } from './kinds/punch-item.js'
import type { Decision } from './types.js'

interface LabelledCase extends RecordedCase<PunchItemInput> {
  expected?: PunchLabel
}

const REPLAY_ENV = { [JEV_TOKEN_ENV]: 'replay' }

async function replay(cases: readonly LabelledCase[], runs: number): Promise<{ results: Decision[][], calls: number }> {
  const fetch = createReplayFetch(punchItem, cases)
  const decider = createDecider({ jev: createJevProvider({ env: REPLAY_ENV, fetch }) })
  const results: Decision[][] = []
  for (let i = 0; i < runs; i++)
    results.push(await decider.decideMany('punch_item', cases.map(c => c.input), { noCache: true, rule: null, fold: false }))
  return { results, calls: fetch.calls }
}

describe('replay smoke — synthetic set', () => {
  const cases = (JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/punch-item.synthetic.json'), 'utf8')) as { items: Array<LabelledCase & { expected: PunchLabel }> }).items

  it('every recorded answer comes back through the decider, and the scorer counts it', async () => {
    const { results, calls } = await replay(cases, 2)
    expect(calls).toBe(2)
    expect(results[0]!.map(d => [d.source, d.choice, d.score])).toEqual(cases.map(c => ['jev', (c.answers.class as { choice: string }).choice, (c.answers.severity as { score: number }).score]))
    const scored = measurePunchCalibration(cases.map(c => c.expected), results[0]!)
    expect(scored).toMatchObject({ total: 12, answered: 12, classMatch: 11, severityWithin1: 11 })
    expect(scored.misses.map(m => [m.index, m.choice, m.level])).toEqual([[8, 'product_defect', 3], [11, 'product_defect', 1]])
    expect(stableChoices(results)).toEqual({ stable: 12, total: 12 })
  })

  it('an item with no recorded answer is unanswered, and a miss', async () => {
    const fetch = createReplayFetch(punchItem, cases.slice(1))
    const [first] = [await createDecider({ jev: createJevProvider({ env: REPLAY_ENV, fetch }) }).decideMany('punch_item', cases.map(c => c.input), { noCache: true, rule: null })]
    expect(first[0]).toMatchObject({ unreviewed: true, fallback: 'no_answer' })
    expect(measurePunchCalibration(cases.map(c => c.expected), first)).toMatchObject({ answered: 11, classMatch: 10 })
  })
})

const POC1_DIR = process.env.CONTENTRAIN_DECIDE_POC1_DIR
const hasPoc1 = Boolean(POC1_DIR && existsSync(join(POC1_DIR, 'manual-labels.json')))

// The PoC-1 set names real sites: it is read in place and never copied here.
describe.skipIf(!hasPoc1)('replay smoke — PoC-1 set, read in place', () => {
  it('sends PoC-1\'s requests: one per site, 25 items at most, 272 items answered', async () => {
    const cases: LabelledCase[] = loadPoc1(POC1_DIR!)
    expect(cases).toHaveLength(272)
    expect(cases.filter(c => c.expected)).toHaveLength(40)
    const { results, calls } = await replay(cases, 1)
    // 22 sites; the one with 49 items splits 25 + 24, as PoC-1's did.
    expect(calls).toBe(23)
    expect(results[0]!.every(d => d.source === 'jev')).toBe(true)
  })
})
