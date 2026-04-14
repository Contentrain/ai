import type {
  StringContext,
  ScanCandidate,
  DuplicateGroup,
  ScanCandidatesResult,
  ScanSummaryResult,
} from '@contentrain/types'
import { join, extname } from 'node:path'
import { readText } from '../util/fs.js'
import {
  autoDetectSourceDirs,
  discoverFiles,
} from './scan-config.js'
import { extractStrings } from './ast-scanner/index.js'
import { calculateContentScore } from './ast-scanner/pre-filter.js'
import type { StructuralContext } from './ast-scanner/types.js'

// ─── Options ───

export interface ScanOptions {
  paths?: string[]
  include?: string[]
  exclude?: string[]
  limit?: number
  offset?: number
  min_length?: number
  max_length?: number
  /** Minimum content confidence score (0-1). Default: 0.4 */
  min_score?: number
}

// ─── Constants ───

const DEFAULT_LIMIT = 50
const DEFAULT_OFFSET = 0
const DEFAULT_MIN_LENGTH = 2
const DEFAULT_MAX_LENGTH = 500
const DEFAULT_MIN_SCORE = 0.4
const SUMMARY_SAMPLE_SIZE = 10

// ─── Context mapping: StructuralContext → StringContext ───

const CONTEXT_MAP: Record<StructuralContext, StringContext> = {
  'template_text': 'template_text',
  'template_attribute': 'template_attribute',
  'jsx_text': 'jsx_text',
  'jsx_attribute': 'jsx_attribute',
  'variable_assignment': 'variable_assignment',
  'object_property': 'object_value',
  'function_argument': 'function_argument',
  'array_element': 'other',
  'enum_value': 'other',
  'template_literal': 'other',
  'switch_case': 'other',
  'other': 'other',
  // Pre-filtered contexts should not reach here, but map them just in case
  'import_path': 'other',
  'type_annotation': 'other',
  'css_class': 'other',
  'css_utility_call': 'other',
  'console_call': 'other',
  'test_assertion': 'other',
}

// ─── Main: scanCandidates ───

export async function scanCandidates(
  projectRoot: string,
  options?: ScanOptions,
): Promise<ScanCandidatesResult> {
  const limit = options?.limit ?? DEFAULT_LIMIT
  const offset = options?.offset ?? DEFAULT_OFFSET
  const minLength = options?.min_length ?? DEFAULT_MIN_LENGTH
  const maxLength = options?.max_length ?? DEFAULT_MAX_LENGTH
  const minScore = options?.min_score ?? DEFAULT_MIN_SCORE

  const scanDirs = options?.paths ?? await autoDetectSourceDirs(projectRoot)
  const files = await discoverFiles(projectRoot, {
    paths: scanDirs,
    include: options?.include,
    exclude: options?.exclude,
  })

  // ─── Phase 1: Extract strings from all files (pre-filter applied inside extractStrings) ───

  const filePromises = files.map(async (relPath) => {
    const filePath = join(projectRoot, relPath)
    const content = await readText(filePath)
    if (!content) return { relPath, extractions: [] }

    const ext = extname(filePath)
    const extractions = await extractStrings(filePath, content, ext)
    return { relPath, extractions }
  })

  const fileResults = await Promise.all(filePromises)

  // ─── Phase 2: Score + length filter + deduplicate ───

  let rawStringsFound = 0
  let skippedCount = 0
  let lowConfidenceCount = 0
  const skipReasons: Record<string, number> = {}

  // Deduplication map: value → first candidate + all occurrences
  const uniqueMap = new Map<string, {
    candidate: ScanCandidate
    maxScore: number
  }>()

  // Also track duplicates for backward compatibility
  const dupeMap = new Map<string, Array<{ file: string; line: number }>>()

  for (const { relPath, extractions } of fileResults) {
    rawStringsFound += extractions.length

    for (const extraction of extractions) {
      // Length filter
      if (extraction.value.length < minLength || extraction.value.length > maxLength) {
        skippedCount++
        skipReasons['length_filter'] = (skipReasons['length_filter'] ?? 0) + 1
        continue
      }

      // shouldSkip was already applied inside extractStrings (via applyPreFilter).
      // But applyPreFilter uses default minScore. Here we apply the user-configured minScore
      // on the contentScore that was attached during pre-filtering.

      // Get the contentScore attached by applyPreFilter
      const contentScore: number = (extraction as unknown as { contentScore?: number }).contentScore ?? calculateContentScore(extraction)

      if (contentScore < minScore) {
        lowConfidenceCount++
        skipReasons['low_confidence'] = (skipReasons['low_confidence'] ?? 0) + 1
        continue
      }

      const mappedContext = CONTEXT_MAP[extraction.context]
      const loc = { file: relPath, line: extraction.line }

      // Track all occurrences for duplicates section
      if (!dupeMap.has(extraction.value)) {
        dupeMap.set(extraction.value, [])
      }
      dupeMap.get(extraction.value)!.push(loc)

      // Deduplication: keep first occurrence, accumulate locations
      if (!uniqueMap.has(extraction.value)) {
        uniqueMap.set(extraction.value, {
          candidate: {
            file: relPath,
            line: extraction.line,
            column: extraction.column,
            value: extraction.value,
            context: mappedContext,
            surrounding: extraction.surrounding,
            contentScore,
            occurrences: [loc],
          },
          maxScore: contentScore,
        })
      } else {
        const entry = uniqueMap.get(extraction.value)!
        entry.candidate.occurrences.push(loc)
        // Keep the highest score across occurrences
        if (contentScore > entry.maxScore) {
          entry.maxScore = contentScore
          entry.candidate.contentScore = contentScore
          entry.candidate.file = relPath
          entry.candidate.line = extraction.line
          entry.candidate.column = extraction.column
          entry.candidate.context = mappedContext
          entry.candidate.surrounding = extraction.surrounding
        }
      }
    }
  }

  // Build sorted unique candidates (highest score first)
  const allUniqueCandidates = [...uniqueMap.values()]
    .map(e => e.candidate)
    .toSorted((a, b) => b.contentScore - a.contentScore)

  // Build duplicate groups (only count >= 2), sorted by count descending
  const duplicates: DuplicateGroup[] = [...dupeMap.entries()]
    .filter(([, occurrences]) => occurrences.length >= 2)
    .map(([value, occurrences]) => ({ value, count: occurrences.length, occurrences }))
    .toSorted((a, b) => b.count - a.count)

  // Pagination on unique candidates
  const uniqueCount = allUniqueCandidates.length
  const paginated = allUniqueCandidates.slice(offset, offset + limit)
  const hasMore = uniqueCount > offset + limit

  return {
    candidates: paginated,
    duplicates,
    stats: {
      files_scanned: files.length,
      raw_strings_found: rawStringsFound,
      skipped: skippedCount,
      low_confidence: lowConfidenceCount,
      unique_candidates: uniqueCount,
      candidates_returned: paginated.length,
      has_more: hasMore,
      skip_reasons: skipReasons,
    },
  }
}

// ─── Main: scanSummary ───

export async function scanSummary(
  projectRoot: string,
  options?: ScanOptions,
): Promise<ScanSummaryResult> {
  const minLength = options?.min_length ?? DEFAULT_MIN_LENGTH
  const maxLength = options?.max_length ?? DEFAULT_MAX_LENGTH
  const minScore = options?.min_score ?? DEFAULT_MIN_SCORE

  const scanDirs = options?.paths ?? await autoDetectSourceDirs(projectRoot)
  const files = await discoverFiles(projectRoot, {
    paths: scanDirs,
    include: options?.include,
    exclude: options?.exclude,
  })

  // Group files by directory
  const dirFiles = new Map<string, string[]>()
  const fileTypes: Record<string, number> = {}

  for (const relPath of files) {
    const parts = relPath.split('/')
    const dir = parts.slice(0, -1).join('/') || '.'
    const ext = extname(relPath)

    if (!dirFiles.has(dir)) dirFiles.set(dir, [])
    dirFiles.get(dir)!.push(relPath)

    fileTypes[ext] = (fileTypes[ext] ?? 0) + 1
  }

  // Sample files per directory and count candidates
  const byDirectory: Record<string, { files: number; candidates: number }> = {}
  const freqMap = new Map<string, number>()
  let totalCandidatesEstimate = 0

  for (const [dir, dirFileList] of dirFiles) {
    const totalInDir = dirFileList.length
    const sampleFiles = dirFileList.slice(0, SUMMARY_SAMPLE_SIZE)
    let sampleCandidates = 0

    const samplePromises = sampleFiles.map(async (relPath) => {
      const filePath = join(projectRoot, relPath)
      const content = await readText(filePath)
      if (!content) return []

      const ext = extname(filePath)
      return extractStrings(filePath, content, ext)
    })

    const sampleResults = await Promise.all(samplePromises)

    for (const extractions of sampleResults) {
      for (const extraction of extractions) {
        // Apply same filters as scanCandidates
        if (extraction.value.length < minLength || extraction.value.length > maxLength) continue

        const contentScore: number = (extraction as unknown as { contentScore?: number }).contentScore ?? calculateContentScore(extraction)
        if (contentScore < minScore) continue

        sampleCandidates++

        // Track frequencies for top_repeated
        const prev = freqMap.get(extraction.value) ?? 0
        freqMap.set(extraction.value, prev + 1)
      }
    }

    // Estimate for full directory
    const avgPerFile = sampleFiles.length > 0 ? sampleCandidates / sampleFiles.length : 0
    const estimatedCandidates = Math.round(avgPerFile * totalInDir)

    byDirectory[dir] = {
      files: totalInDir,
      candidates: estimatedCandidates,
    }

    totalCandidatesEstimate += estimatedCandidates
  }

  // Top repeated strings
  const topRepeated = [...freqMap.entries()]
    .filter(([, count]) => count >= 2)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([value, count]) => ({ value, count }))

  return {
    total_files: files.length,
    total_candidates_estimate: totalCandidatesEstimate,
    by_directory: byDirectory,
    top_repeated: topRepeated,
    sampling_note: `Based on first ${SUMMARY_SAMPLE_SIZE} files per directory. Counts are from sampled subset, not project-wide.`,
    file_types: fileTypes,
  }
}
