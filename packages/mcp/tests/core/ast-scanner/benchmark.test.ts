import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { appendFile, readdir, readFile } from 'node:fs/promises'
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

interface SkippedCase {
  name: string
  reason: string
}

const FIXTURE_ROOT = join(import.meta.dirname, '..', '..', 'fixtures', 'scanner-golden')

describe('ast-scanner golden benchmark', () => {
  it('meets per-case and overall precision/recall thresholds across supported ecosystems', async () => {
    const caseDirs = (await readdir(FIXTURE_ROOT, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .toSorted()

    const caseResults = await Promise.all(caseDirs.map(runGoldenCase))
    const caseMetrics = caseResults.filter((entry): entry is Exclude<typeof entry, SkippedCase> => 'metrics' in entry)
    const skippedCases = caseResults.filter((entry): entry is SkippedCase => 'reason' in entry)

    for (const entry of caseMetrics) {
      expect(
        entry.metrics.precision,
        formatFailure(entry.name, 'precision', entry.metrics),
      ).toBeGreaterThanOrEqual(entry.minPrecision)

      expect(
        entry.metrics.recall,
        formatFailure(entry.name, 'recall', entry.metrics),
      ).toBeGreaterThanOrEqual(entry.minRecall)
    }

    const totals = caseMetrics.reduce((acc, current) => {
      acc.tp += current.metrics.tp
      acc.fp += current.metrics.fp
      acc.fn += current.metrics.fn
      return acc
    }, { tp: 0, fp: 0, fn: 0 })

    const overallPrecision = totals.tp === 0 ? 1 : totals.tp / (totals.tp + totals.fp)
    const overallRecall = totals.tp === 0 ? 1 : totals.tp / (totals.tp + totals.fn)

    // Overall thresholds account for regex-fallback frameworks (Svelte, Astro) dragging precision down
    expect(overallPrecision, `overall precision too low: ${overallPrecision.toFixed(3)}`).toBeGreaterThanOrEqual(0.8)
    expect(overallRecall, `overall recall too low: ${overallRecall.toFixed(3)}`).toBeGreaterThanOrEqual(0.8)

    await writeCiSummary(caseMetrics, skippedCases, overallPrecision, overallRecall)
  })
})

async function runGoldenCase(caseName: string): Promise<
  { name: string; metrics: CaseMetrics; minPrecision: number; minRecall: number } | SkippedCase
> {
  const caseDir = join(FIXTURE_ROOT, caseName)
  const golden = JSON.parse(
    await readFile(join(caseDir, 'expected.json'), 'utf-8'),
  ) as GoldenCase

  try {
    const result = await scanCandidates(caseDir, { paths: golden.scan_paths, limit: 1000 })
    const metrics = measureCase(result.candidates, golden.should_detect)

    return {
      name: golden.name,
      metrics,
      minPrecision: golden.min_precision,
      minRecall: golden.min_recall,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('is required to parse')) {
      return {
        name: golden.name,
        reason: message,
      }
    }
    throw error
  }
}

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

async function writeCiSummary(
  caseMetrics: Array<{ name: string; metrics: CaseMetrics; minPrecision: number; minRecall: number }>,
  skippedCases: SkippedCase[],
  overallPrecision: number,
  overallRecall: number,
): Promise<void> {
  const lines = [
    '## MCP Scanner Golden Benchmark',
    '',
    '| Case | Precision | Recall | TP | FP | FN | Thresholds |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...caseMetrics.map(entry =>
      `| ${entry.name} | ${entry.metrics.precision.toFixed(3)} | ${entry.metrics.recall.toFixed(3)} | ${entry.metrics.tp} | ${entry.metrics.fp} | ${entry.metrics.fn} | P>=${entry.minPrecision.toFixed(2)} / R>=${entry.minRecall.toFixed(2)} |`,
    ),
    '',
    ...(skippedCases.length > 0
      ? [
          '### Skipped Cases',
          '',
          ...skippedCases.map(entry => `- ${entry.name}: ${entry.reason}`),
          '',
        ]
      : []),
    `Overall precision: ${overallPrecision.toFixed(3)}`,
    '',
    `Overall recall: ${overallRecall.toFixed(3)}`,
    '',
  ]

  const summary = `${lines.join('\n')}\n`
  console.info(`\n${summary}`)

  const stepSummaryPath = process.env['GITHUB_STEP_SUMMARY']
  if (stepSummaryPath) {
    await appendFile(stepSummaryPath, summary, 'utf-8')
  }
}
