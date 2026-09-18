// ─── Calibration ───
//
// A kind is trusted only as far as a live run has measured it against hand
// labels. The measurement is `pnpm calibration:live`, which writes
// `calibration/<date>.json` with the model and the request-shape hash it
// measured; the numbers in the docs are that file's. Two tools here:
//   - `measurePunchCalibration` scores punch_item decisions against labels
//     the way PoC-1 did: exact class, severity within one level.
//   - `createReplayFetch` answers requests from recorded answers — a smoke
//     test of the code path, not a measurement.

import { buildJevRequest } from './jev.js'
import { severityLevel } from './kinds/punch-item.js'
import type { Decision, JevAnswer, KindSpec } from './types.js'

export interface RecordedCase<I> {
  input: I
  /** The item's answers, keyed by the kind's question suffixes. */
  answers: Record<string, JevAnswer>
}

/** A request's header and one item line, as a replay key. */
function replayKey(state: string, line: string): string {
  const first = state.search(/^Item 1: /m)
  return `${first > 0 ? state.slice(0, first) : ''}\u0000${line}`
}

/**
 * A `fetch` that answers systemone requests for `spec` from recorded answers,
 * matching each item by its request header and its rendered line. An item
 * with no recording gets no answers, which the decider treats as `no_answer`.
 * `calls` counts requests.
 *
 * A replay re-reads the answers a model gave once. It checks the code path —
 * shaping, grouping, batching, reading — and says nothing about how the model
 * answers today; only a live run does.
 */
export function createReplayFetch<I>(spec: KindSpec<I, any>, cases: ReadonlyArray<RecordedCase<I>>, model = 'replay'): typeof globalThis.fetch & { calls: number } {
  const byKey = new Map<string, Record<string, JevAnswer>>()
  for (const recorded of cases) {
    const { state } = buildJevRequest(spec, [spec.shape(recorded.input)])
    const line = /^Item 1: (.*)$/m.exec(state)![1]!
    byKey.set(replayKey(state, line), recorded.answers)
  }
  const replay = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    replay.calls++
    const { state } = JSON.parse(String(init?.body)) as { state: string }
    const answers: Record<string, JevAnswer> = {}
    for (const line of state.split('\n')) {
      const match = /^Item (\d+): (.*)$/.exec(line)
      const recorded = match ? byKey.get(replayKey(state, match[2]!)) : undefined
      if (!recorded) continue
      for (const [suffix, answer] of Object.entries(recorded)) answers[`item${match![1]}_${suffix}`] = answer
    }
    return new Response(JSON.stringify({ model, answers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  replay.calls = 0
  return replay as typeof globalThis.fetch & { calls: number }
}

export interface PunchLabel {
  class: string
  /** 1–4. */
  severity: number
}

export interface PunchCalibration {
  total: number
  answered: number
  classMatch: number
  severityWithin1: number
  classRate: number
  severityRate: number
  misses: Array<{ index: number, expected: PunchLabel, choice?: string, level?: number }>
}

/** Exact class and severity within one level, over every label (an unanswered item counts as a miss). */
export function measurePunchCalibration(labels: readonly PunchLabel[], decisions: readonly Decision[]): PunchCalibration {
  let answered = 0
  let classMatch = 0
  let severityWithin1 = 0
  const misses: PunchCalibration['misses'] = []
  labels.forEach((expected, index) => {
    const decision = decisions[index]
    if (decision?.choice === undefined || decision.score === undefined || decision.unreviewed) {
      misses.push({ index, expected })
      return
    }
    answered++
    const level = severityLevel(decision.score)
    const classOk = decision.choice === expected.class
    const severityOk = Math.abs(level - expected.severity) <= 1
    if (classOk) classMatch++
    if (severityOk) severityWithin1++
    if (!classOk || !severityOk) misses.push({ index, expected, choice: decision.choice, level })
  })
  const total = labels.length
  return {
    total,
    answered,
    classMatch,
    severityWithin1,
    classRate: total ? classMatch / total : 0,
    severityRate: total ? severityWithin1 / total : 0,
    misses,
  }
}

/** Whether repeated runs over the same inputs chose the same class for every item. */
export function stableChoices(runs: ReadonlyArray<readonly Decision[]>): { stable: number, total: number } {
  const total = runs[0]?.length ?? 0
  let stable = 0
  for (let i = 0; i < total; i++) {
    const choices = new Set(runs.map(run => run[i]?.choice))
    if (choices.size === 1 && !choices.has(undefined)) stable++
  }
  return { stable, total }
}
