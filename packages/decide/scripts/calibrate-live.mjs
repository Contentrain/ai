// pnpm calibration:live [-- --provider jev|haiku|both] — the punch_item gate,
// measured against a provider as it is today. Needs CONTENTRAIN_DECIDE_POC1_DIR
// and a build (it runs the published code, dist/); Jev needs
// CONTENTRAIN_JEW_API_TOKEN, Haiku needs ANTHROPIC_API_KEY. Default: jev.
//
// PoC-1's 272 items go out exactly as the package sends them — one site per
// request, at most 25 items, repeated items kept — three times, with no cache
// and no rule, to one provider only. The 40 labelled items are scored in each
// run. The gate is set to what Jev measurably does, since it does not answer
// the same request the same way every time (see README), and Haiku is held to
// the same gate:
//   the median run's class agreement ≥ 85% and severity within one level ≥ 90%;
//   the same class in all three runs for ≥ 85% of the labelled items.
// Jev's result is written to calibration/<date>.json, Haiku's to
// calibration/haiku/<date>.json, with the model the provider reported and the
// request-shape hash. It holds counts only — no item text, no site. Commit
// it: the docs quote it, and a test holds the shipped request shape to the
// latest Jev file. Exit code 1 when a gate fails (the file is written either way).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANTHROPIC_KEY_ENV, DEFAULT_ANTHROPIC_MODEL, JEV_TOKEN_ENV, anthropicRequestShapeHash, createAnthropicProvider, createDecider, createJevProvider, measurePunchCalibration, punchItem, requestShapeHash, stableChoices } from '../dist/index.mjs'
import { loadPoc1 } from './poc1.mjs'

const RUNS = 3
const GATE = { median_class_rate: 0.85, median_severity_within_1_rate: 0.9, stable_rate: 0.85 }
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
// Haiku 4.5 list price, USD per million tokens; recorded so the file carries a cost. Jev publishes none.
const HAIKU_PRICING = { inputPerMTok: 1, outputPerMTok: 5 }

const flag = process.argv.indexOf('--provider')
const which = flag === -1 ? 'jev' : process.argv[flag + 1]
if (!['jev', 'haiku', 'both'].includes(which)) throw new Error(`--provider must be jev, haiku or both (got ${which})`)
const selected = which === 'both' ? ['jev', 'haiku'] : [which]

const dir = process.env.CONTENTRAIN_DECIDE_POC1_DIR
if (!dir) throw new Error('set CONTENTRAIN_DECIDE_POC1_DIR to the PoC-1 experiment directory')
for (const [name, env] of [['jev', JEV_TOKEN_ENV], ['haiku', ANTHROPIC_KEY_ENV]]) {
  if (selected.includes(name) && !process.env[env]?.trim()) throw new Error(`set ${env} to calibrate ${name}`)
}

const cases = loadPoc1(dir)
const labelled = cases.flatMap((c, i) => (c.expected ? [i] : []))
let failed = false
for (const name of selected) {
  if (!(await calibrate(name))) failed = true
}
if (failed) process.exitCode = 1

/** Three runs of PoC-1 against one provider; writes its file and returns whether the gate passed. */
async function calibrate(name) {
  let requests = 0
  const fetch = (...args) => {
    requests++
    return globalThis.fetch(...args)
  }
  // One provider at a time: the other link is off, so every answer is this provider's.
  const decider = name === 'jev'
    ? createDecider({ jev: createJevProvider({ fetch }) })
    : createDecider({ jev: false, llm: createAnthropicProvider({ fetch }), pricing: { llm: HAIKU_PRICING } })
  const source = name === 'jev' ? 'jev' : 'llm'

  const runs = []
  for (let run = 0; run < RUNS; run++) {
    const decisions = await decider.decideMany('punch_item', cases.map(c => c.input), { rule: null, noCache: true, fold: false })
    const unanswered = decisions.filter(d => d.source !== source).length
    if (unanswered) throw new Error(`${name} run ${run + 1}: ${unanswered} items got no answer (${[...new Set(decisions.map(d => d.fallback).filter(Boolean))].join(', ')})`)
    runs.push(decisions)
    console.log(`${name} run ${run + 1}/${RUNS}: ${decisions.length} decisions`)
  }

  const expected = labelled.map(i => cases[i].expected)
  const perRun = runs.map((decisions) => {
    const m = measurePunchCalibration(expected, labelled.map(i => decisions[i]))
    return { class_match: m.classMatch, severity_within_1: m.severityWithin1, class_rate: m.classRate, severity_within_1_rate: m.severityRate }
  })
  const stableLabelled = stableChoices(runs.map(decisions => labelled.map(i => decisions[i])))
  const stableAll = stableChoices(runs)
  const tokens = runs.flat().reduce((sum, d) => ({ input: sum.input + (d.cost?.input_tokens ?? 0), output: sum.output + (d.cost?.output_tokens ?? 0) }), { input: 0, output: 0 })
  const usd = name === 'haiku' ? Math.round(runs.flat().reduce((sum, d) => sum + (d.cost?.usd ?? 0), 0) * 1e4) / 1e4 : undefined
  const models = [...new Set(runs.flat().map(d => d.model))]

  const medianClass = median(perRun.map(r => r.class_rate))
  const medianSeverity = median(perRun.map(r => r.severity_within_1_rate))
  const stableRate = stableLabelled.stable / stableLabelled.total
  const passed = medianClass >= GATE.median_class_rate && medianSeverity >= GATE.median_severity_within_1_rate && stableRate >= GATE.stable_rate

  const date = new Date().toISOString().slice(0, 10)
  const record = {
    kind: punchItem.kind,
    version: punchItem.version,
    provider: name,
    // The cache key's shape: the Jev prompt, whichever provider answered.
    shape: requestShapeHash(punchItem),
    ...(name === 'haiku' ? { llm_shape: anthropicRequestShapeHash(punchItem), temperature: 0 } : {}),
    requested_model: name === 'jev' ? 'jev-latest' : DEFAULT_ANTHROPIC_MODEL,
    model: models.length === 1 ? models[0] : models,
    measured_at: new Date().toISOString(),
    set: { name: 'PoC-1', items: cases.length, labelled: labelled.length, sites: new Set(cases.map(c => c.site)).size },
    runs: RUNS,
    requests,
    tokens,
    ...(usd === undefined ? {} : { usd, pricing: HAIKU_PRICING }),
    per_run: perRun,
    stable: { labelled: stableLabelled, all: stableAll },
    gate: { thresholds: GATE, median_class_rate: medianClass, median_severity_within_1_rate: medianSeverity, stable_rate: stableRate, passed },
  }
  const folder = join(import.meta.dirname, '../calibration', name === 'jev' ? '' : name)
  const out = join(folder, `${date}.json`)
  mkdirSync(folder, { recursive: true })
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`)
  console.log(JSON.stringify({ provider: name, shape: record.shape, model: record.model, per_run: perRun, stable: record.stable, gate: record.gate }, null, 2))
  console.log(`wrote ${out}`)
  return passed
}
