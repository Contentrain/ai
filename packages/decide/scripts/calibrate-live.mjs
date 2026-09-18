// pnpm calibration:live — the punch_item gate, measured against Jev as it is
// today. Needs CONTENTRAIN_JEW_API_TOKEN and CONTENTRAIN_DECIDE_POC1_DIR, and
// a build (it runs the published code, dist/).
//
// PoC-1's 272 items go out exactly as the package sends them — one site per
// request, at most 25 items, repeated items kept — three times, with no cache
// and no rule. The 40 labelled items are scored in each run. The gate is set
// to what Jev measurably does, since it does not answer the same request the
// same way every time (see README):
//   the median run's class agreement ≥ 85% and severity within one level ≥ 90%;
//   the same class in all three runs for ≥ 85% of the labelled items.
// The result is written to calibration/<date>.json with the model Jev reported
// and the request-shape hash. It holds counts only — no item text, no site.
// Commit it: the docs quote it, and a test holds the shipped request shape to
// the one it measured. Exit code 1 when the gate fails (the file is written
// either way).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { JEV_TOKEN_ENV, createDecider, createJevProvider, measurePunchCalibration, punchItem, requestShapeHash, stableChoices } from '../dist/index.mjs'
import { loadPoc1 } from './poc1.mjs'

const RUNS = 3
const GATE = { median_class_rate: 0.85, median_severity_within_1_rate: 0.9, stable_rate: 0.85 }
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]

const dir = process.env.CONTENTRAIN_DECIDE_POC1_DIR
if (!dir) throw new Error('set CONTENTRAIN_DECIDE_POC1_DIR to the PoC-1 experiment directory')
if (!process.env[JEV_TOKEN_ENV]?.trim()) throw new Error(`set ${JEV_TOKEN_ENV}`)

const cases = loadPoc1(dir)
const labelled = cases.flatMap((c, i) => (c.expected ? [i] : []))
let requests = 0
const fetch = (...args) => {
  requests++
  return globalThis.fetch(...args)
}
const decider = createDecider({ jev: createJevProvider({ fetch }), breakers: {} })

const runs = []
for (let run = 0; run < RUNS; run++) {
  const decisions = await decider.decideMany('punch_item', cases.map(c => c.input), { rule: null, noCache: true, fold: false })
  const unanswered = decisions.filter(d => d.source !== 'jev').length
  if (unanswered) throw new Error(`run ${run + 1}: ${unanswered} items got no Jev answer (${[...new Set(decisions.map(d => d.fallback).filter(Boolean))].join(', ')})`)
  runs.push(decisions)
  console.log(`run ${run + 1}/${RUNS}: ${decisions.length} decisions`)
}

const expected = labelled.map(i => cases[i].expected)
const perRun = runs.map((decisions) => {
  const m = measurePunchCalibration(expected, labelled.map(i => decisions[i]))
  return { class_match: m.classMatch, severity_within_1: m.severityWithin1, class_rate: m.classRate, severity_within_1_rate: m.severityRate }
})
const stableLabelled = stableChoices(runs.map(decisions => labelled.map(i => decisions[i])))
const stableAll = stableChoices(runs)
const tokens = runs.flat().reduce((sum, d) => ({ input: sum.input + (d.cost?.input_tokens ?? 0), output: sum.output + (d.cost?.output_tokens ?? 0) }), { input: 0, output: 0 })
const models = [...new Set(runs.flat().map(d => d.model))]

const medianClass = median(perRun.map(r => r.class_rate))
const medianSeverity = median(perRun.map(r => r.severity_within_1_rate))
const stableRate = stableLabelled.stable / stableLabelled.total
const passed = medianClass >= GATE.median_class_rate && medianSeverity >= GATE.median_severity_within_1_rate && stableRate >= GATE.stable_rate

const date = new Date().toISOString().slice(0, 10)
const record = {
  kind: punchItem.kind,
  version: punchItem.version,
  shape: requestShapeHash(punchItem),
  requested_model: 'jev-latest',
  model: models.length === 1 ? models[0] : models,
  measured_at: new Date().toISOString(),
  set: { name: 'PoC-1', items: cases.length, labelled: labelled.length, sites: new Set(cases.map(c => c.site)).size },
  runs: RUNS,
  requests,
  tokens,
  per_run: perRun,
  stable: { labelled: stableLabelled, all: stableAll },
  gate: { thresholds: GATE, median_class_rate: medianClass, median_severity_within_1_rate: medianSeverity, stable_rate: stableRate, passed },
}
const out = join(import.meta.dirname, '../calibration', `${date}.json`)
mkdirSync(join(import.meta.dirname, '../calibration'), { recursive: true })
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`)
console.log(JSON.stringify({ shape: record.shape, model: record.model, per_run: perRun, stable: record.stable, gate: record.gate }, null, 2))
console.log(`wrote ${out}`)
if (!passed) process.exitCode = 1
