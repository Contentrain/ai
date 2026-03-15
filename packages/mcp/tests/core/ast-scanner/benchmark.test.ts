import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { scanCandidates } from '../../../src/core/scanner.js'

interface ExpectedDetection {
  file: string
  value: string
  context?: string
  line?: number
}

interface GoldenCase {
  name: string
  scan_paths: string[]
  min_precision: number
  min_recall: number
  should_detect: ExpectedDetection[]
}

interface CaseMetrics {
  precision: number
  recall: number
  tp: number
  fp: number
  fn: number
  falsePositives: string[]
  falseNegatives: string[]
}

const FIXTURE_ROOT = join(import.meta.dirname, '..', '..', 'fixtures', 'scanner-golden')

describe('ast-scanner golden benchmark', () => {
  it('meets per-case and overall precision/recall thresholds across supported ecosystems', async () => {
    const caseDirs = (await readdir(FIXTURE_ROOT, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .toSorted()

    const caseMetrics: Array<{ name: string; metrics: CaseMetrics; minPrecision: number; minRecall: number }> = []

    for (const caseName of caseDirs) {
      const caseDir = join(FIXTURE_ROOT, caseName)
      const golden = JSON.parse(
        await readFile(join(caseDir, 'expected.json'), 'utf-8'),
      ) as GoldenCase

      const result = await scanCandidates(caseDir, { paths: golden.scan_paths, limit: 1000 })
      const metrics = measureCase(result.candidates, golden.should_detect)

      caseMetrics.push({
        name: golden.name,
        metrics,
        minPrecision: golden.min_precision,
        minRecall: golden.min_recall,
      })

      expect(
        metrics.precision,
        formatFailure(golden.name, 'precision', metrics),
      ).toBeGreaterThanOrEqual(golden.min_precision)

      expect(
        metrics.recall,
        formatFailure(golden.name, 'recall', metrics),
      ).toBeGreaterThanOrEqual(golden.min_recall)
    }

    const totals = caseMetrics.reduce((acc, current) => {
      acc.tp += current.metrics.tp
      acc.fp += current.metrics.fp
      acc.fn += current.metrics.fn
      return acc
    }, { tp: 0, fp: 0, fn: 0 })

    const overallPrecision = totals.tp === 0 ? 1 : totals.tp / (totals.tp + totals.fp)
    const overallRecall = totals.tp === 0 ? 1 : totals.tp / (totals.tp + totals.fn)

    expect(overallPrecision, `overall precision too low: ${overallPrecision.toFixed(3)}`).toBeGreaterThanOrEqual(0.9)
    expect(overallRecall, `overall recall too low: ${overallRecall.toFixed(3)}`).toBeGreaterThanOrEqual(0.9)
  })
})

function measureCase(
  candidates: Array<{ file: string; value: string; context?: string; line?: number }>,
  expectedDetections: ExpectedDetection[],
): CaseMetrics {
  const expectedKeys = new Set(expectedDetections.map(buildExpectedKey))
  const matchedExpected = new Set<string>()

  let tp = 0
  let fp = 0
  const falsePositives: string[] = []

  for (const candidate of candidates) {
    const exactKey = buildCandidateKey(candidate)
    const looseKey = buildCandidateLooseKey(candidate)

    if (expectedKeys.has(exactKey)) {
      tp++
      matchedExpected.add(exactKey)
      continue
    }

    const matchedLoose = expectedDetections.find((item) => {
      const key = buildExpectedLooseKey(item)
      return key === looseKey
    })

    if (matchedLoose) {
      tp++
      matchedExpected.add(buildExpectedKey(matchedLoose))
      continue
    }

    fp++
    falsePositives.push(`${candidate.file}:${candidate.line ?? 0}:${candidate.context ?? 'unknown'}:${candidate.value}`)
  }

  const falseNegatives = expectedDetections
    .filter(item => !matchedExpected.has(buildExpectedKey(item)))
    .map(item => `${item.file}:${item.line ?? 0}:${item.context ?? 'unknown'}:${item.value}`)

  const fn = falseNegatives.length
  const precision = tp === 0 ? 1 : tp / (tp + fp)
  const recall = expectedDetections.length === 0 ? 1 : tp / (tp + fn)

  return { precision, recall, tp, fp, fn, falsePositives, falseNegatives }
}

function buildExpectedKey(item: ExpectedDetection): string {
  return `${item.file}:${item.line ?? 0}:${item.context ?? 'unknown'}:${item.value}`
}

function buildExpectedLooseKey(item: ExpectedDetection): string {
  return `${item.file}:${item.context ?? 'unknown'}:${item.value}`
}

function buildCandidateKey(item: { file: string; value: string; context?: string; line?: number }): string {
  return `${item.file}:${item.line ?? 0}:${item.context ?? 'unknown'}:${item.value}`
}

function buildCandidateLooseKey(item: { file: string; value: string; context?: string }): string {
  return `${item.file}:${item.context ?? 'unknown'}:${item.value}`
}

function formatFailure(caseName: string, metric: 'precision' | 'recall', metrics: CaseMetrics): string {
  return [
    `${caseName} ${metric} below threshold`,
    `precision=${metrics.precision.toFixed(3)} recall=${metrics.recall.toFixed(3)} tp=${metrics.tp} fp=${metrics.fp} fn=${metrics.fn}`,
    metrics.falsePositives.length > 0 ? `false_positives=${metrics.falsePositives.join(' | ')}` : '',
    metrics.falseNegatives.length > 0 ? `false_negatives=${metrics.falseNegatives.join(' | ')}` : '',
  ].filter(Boolean).join('\n')
}
