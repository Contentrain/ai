// Calibration of punch_item against hand labels.
//
// Three tiers:
//   1. Synthetic (always): an invented set checked in beside this file. It
//      proves the harness — replay, batching, reading, scoring — not the model.
//   2. PoC-1 offline (when CONTENTRAIN_DECIDE_POC1_DIR is set): the 40
//      hand-labelled punch items from 22 cohort run reports and the answers
//      jev-1.13.0 gave them, read in place from the experiment directory.
//      That data names real sites and stays out of this public repository.
//      Gate: class ≥ 90%, severity within one level ≥ 95%, 5/5 stable.
//   3. PoC-1 live (when the directory and CONTENTRAIN_JEW_API_TOKEN are both
//      set): the same set asked of Jev now, five times. Same gate. Ten
//      requests. CI has no token, so CI skips it.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createReplayFetch, measurePunchCalibration, stableChoices } from './calibration.js'
import type { PunchLabel, RecordedCase } from './calibration.js'
import { createDecider } from './decide.js'
import { JEV_TOKEN_ENV, createJevProvider } from './jev.js'
import { punchItem } from './kinds/punch-item.js'
import type { PunchItemInput } from './kinds/punch-item.js'
import type { Decision, JevAnswer } from './types.js'

vi.setConfig({ testTimeout: 120_000 })

interface LabelledCase extends RecordedCase<PunchItemInput> {
  id: string
  expected: PunchLabel
}

const RUNS = 5

/** Decide every case `runs` times with no cache and no rule — the model alone. */
async function runs(fetch: typeof globalThis.fetch, env: Record<string, string | undefined>, cases: readonly LabelledCase[], count = RUNS): Promise<Decision[][]> {
  const decider = createDecider({ jev: createJevProvider({ env, fetch }) })
  const out: Decision[][] = []
  for (let i = 0; i < count; i++)
    out.push(await decider.decideMany('punch_item', cases.map(c => c.input), { noCache: true, rule: null }))
  return out
}

function gate(cases: readonly LabelledCase[], results: Decision[][]) {
  const calibration = measurePunchCalibration(cases.map(c => c.expected), results[0]!)
  const stability = stableChoices(results)
  return { calibration, stability }
}

const REPLAY_ENV = { [JEV_TOKEN_ENV]: 'replay' }

describe('calibration harness — synthetic set', () => {
  const doc = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/punch-item.synthetic.json'), 'utf8')) as { items: LabelledCase[] }
  const cases = doc.items

  it('replays recorded answers through the full decider and scores them', async () => {
    const fetch = createReplayFetch(punchItem, cases)
    const results = await runs(fetch, REPLAY_ENV, cases)
    const { calibration, stability } = gate(cases, results)
    expect(fetch.calls).toBe(RUNS)
    expect(calibration).toMatchObject({ total: 12, answered: 12, classMatch: 11, severityWithin1: 11 })
    expect(calibration.misses.map(m => [m.index, m.choice, m.level])).toEqual([[8, 'product_defect', 3], [11, 'product_defect', 1]])
    expect(stability).toEqual({ stable: 12, total: 12 })
  })

  it('counts an item with no recorded answer as unanswered and a miss', async () => {
    const fetch = createReplayFetch(punchItem, cases.slice(1))
    const [first] = await runs(fetch, REPLAY_ENV, cases, 1)
    expect(first![0]).toMatchObject({ unreviewed: true, fallback: 'no_answer' })
    expect(measurePunchCalibration(cases.map(c => c.expected), first!)).toMatchObject({ answered: 11, classMatch: 10 })
    expect(stableChoices([first!, first!]).stable).toBe(11)
  })
})

// ─── PoC-1, read in place ───

const POC1_DIR = process.env.CONTENTRAIN_DECIDE_POC1_DIR
const hasPoc1 = Boolean(POC1_DIR && existsSync(join(POC1_DIR, 'manual-labels.json')))

function loadPoc1(dir: string): LabelledCase[] {
  const read = <T>(name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T
  type Item = { site: string, itemIndex: number, label: string, link: string, reason: string, decision: string, median: number, mobileMedian: number }
  const inventory = read<Item[]>('inventory.json')
  const labels = read<{ labels: Array<{ site: string, itemIndex: number, class: string, severity: number }> }>('manual-labels.json').labels
  const batched = read<Record<string, { results: Array<{ itemOffset: number, response: { answers: Record<string, JevAnswer> } }> }>>('results-batched.json')
  const answers = new Map<string, Record<string, JevAnswer>>()
  for (const [site, result] of Object.entries(batched)) {
    for (const chunk of result.results) {
      for (let n = 1; chunk.response.answers[`item${n}_class`]; n++) {
        answers.set(`${site}#${chunk.itemOffset + n - 1}`, {
          class: chunk.response.answers[`item${n}_class`]!,
          severity: chunk.response.answers[`item${n}_severity`]!,
        })
      }
    }
  }
  return labels.map((label) => {
    const item = inventory.find(i => i.site === label.site && i.itemIndex === label.itemIndex)!
    return {
      id: `${label.site}#${label.itemIndex}`,
      input: { label: item.label, reason: item.reason, link: item.link, site: { decision: item.decision, median: item.median, mobile_median: item.mobileMedian } },
      expected: { class: label.class, severity: label.severity },
      answers: answers.get(`${label.site}#${label.itemIndex}`)!,
    }
  })
}

describe.skipIf(!hasPoc1)('calibration — PoC-1 set, recorded answers (offline)', () => {
  it('holds the gate: class ≥ 90%, severity ±1 ≥ 95%, 5/5 stable', async () => {
    const cases = loadPoc1(POC1_DIR!)
    expect(cases).toHaveLength(40)
    expect(new Set(cases.map(c => c.id.split('#')[0])).size).toBe(22)
    const results = await runs(createReplayFetch(punchItem, cases), REPLAY_ENV, cases)
    const { calibration, stability } = gate(cases, results)
    expect(calibration.answered).toBe(40)
    expect(calibration.classRate).toBeGreaterThanOrEqual(0.9)
    expect(calibration.severityRate).toBeGreaterThanOrEqual(0.95)
    expect(stability).toEqual({ stable: 40, total: 40 })
    // PoC-1's own figures, reproduced through this package's code path.
    expect([calibration.classMatch, calibration.severityWithin1]).toEqual([37, 39])
  })
})

const TOKEN_SET = Boolean(process.env[JEV_TOKEN_ENV]?.trim())

describe.skipIf(!hasPoc1 || !TOKEN_SET)('calibration — PoC-1 set, live Jev', () => {
  it('holds the gate against the model as it is today', async () => {
    const cases = loadPoc1(POC1_DIR!)
    const results = await runs(globalThis.fetch, process.env, cases)
    const { calibration, stability } = gate(cases, results)
    expect(results.flat().every(d => d.source === 'jev')).toBe(true)
    expect(calibration.classRate).toBeGreaterThanOrEqual(0.9)
    expect(calibration.severityRate).toBeGreaterThanOrEqual(0.95)
    expect(stability).toEqual({ stable: 40, total: 40 })
  })
})
