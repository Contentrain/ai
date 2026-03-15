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
}

// ─── Constants ───

const DEFAULT_LIMIT = 50
const DEFAULT_OFFSET = 0
const DEFAULT_MIN_LENGTH = 2
const DEFAULT_MAX_LENGTH = 500
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

// ─── Legacy Pre-filter (kept exported for backward compatibility) ───

const IMPORT_PATH_RE = /^(\.\/|\.\.\/|@\/|@[a-z]|[a-z][a-z0-9-]*\/)/
const CSS_CLASS_PREFIX_RE = /^(flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|p-|m-|w-|h-|bg-|text-|border-|rounded|shadow|gap-|space-|font-|leading-|tracking-|opacity-|z-|overflow-|cursor-|transition|transform|animate-|hover:|focus:|active:|dark:|sm:|md:|lg:|xl:)/
const URL_ROUTE_RE = /^(https?:\/\/|\/api\/|\/v[0-9]|#\/|mailto:|tel:)/
const ROUTE_LIKE_RE = /^\/[a-z0-9/:_-]*$/i
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|transparent|inherit|currentColor)$/i
const CAMEL_CASE_RE = /^[a-z][a-zA-Z0-9]*$/
const SCREAMING_SNAKE_RE = /^[A-Z][A-Z0-9_]+$/
const KEBAB_TECH_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/
const FILE_EXT_RE = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|scss|less|js|ts|tsx|jsx|json|md|html|xml|yaml|yml|woff|woff2|ttf|eot|mp4|webm|mp3|wav|pdf)$/i
const REGEX_LIKE_RE = /^\^|^\(.*\)$|\$$|\\d|\\w|\\s|\.\*|\.\+/
const CONSOLE_RE = /console\.(log|warn|error|debug|info|trace)\s*\(/

// Common content words that should NOT be filtered when they appear in kebab-case
const CONTENT_WORDS = new Set([
  'sign', 'up', 'log', 'in', 'out', 'get', 'started', 'learn', 'more',
  'read', 'click', 'here', 'go', 'back', 'next', 'prev', 'previous',
  'see', 'all', 'view', 'show', 'hide', 'open', 'close', 'add', 'new',
  'save', 'edit', 'delete', 'remove', 'submit', 'cancel', 'confirm',
  'welcome', 'hello', 'thank', 'you', 'good', 'bye', 'hi', 'hey',
  'no', 'yes', 'ok', 'sorry', 'please', 'help', 'about', 'contact',
  'home', 'page', 'not', 'found', 'error', 'success', 'loading',
])

/**
 * Determines if a string is non-content (technical) and should be filtered out.
 * Pure function — no side effects, no semantic decisions.
 * Conservative: if in doubt, returns false (keeps the string).
 *
 * @deprecated Kept for backward compatibility. Scanner v2 uses structural pre-filter instead.
 */
export function isNonContent(value: string, lineContext: string, minLength: number = DEFAULT_MIN_LENGTH, maxLength: number = DEFAULT_MAX_LENGTH): boolean {
  // Length checks
  if (value.length < minLength) return true
  if (value.length > maxLength) return true

  // Import/require paths (no spaces, looks like module path)
  if (IMPORT_PATH_RE.test(value) && !value.includes(' ')) return true

  // CSS class strings — single class prefix
  if (CSS_CLASS_PREFIX_RE.test(value) && !value.includes(' ')) return true

  // CSS class strings — multiple space-separated tokens that all look like utility classes
  if (value.includes(' ') && looksLikeCssClasses(value)) return true

  // URL/route patterns
  if (URL_ROUTE_RE.test(value)) return true
  if (value.startsWith('/') && ROUTE_LIKE_RE.test(value)) return true

  // Color codes
  if (COLOR_RE.test(value)) return true

  // Technical identifiers (includes kebab-case with content-word awareness)
  if (isTechnicalIdentifier(value)) return true

  // File paths with extensions
  if (FILE_EXT_RE.test(value)) return true

  // RegExp-like patterns
  if (REGEX_LIKE_RE.test(value)) return true

  // Console/log context
  if (CONSOLE_RE.test(lineContext)) return true

  return false
}

function isTechnicalIdentifier(value: string): boolean {
  // No spaces allowed in identifiers
  if (value.includes(' ')) return false

  // camelCase: starts lowercase, has at least one uppercase letter, no spaces
  if (CAMEL_CASE_RE.test(value) && /[A-Z]/.test(value)) return true

  // SCREAMING_SNAKE_CASE — only filter if it contains underscores (true SCREAMING_SNAKE like API_KEY, MAX_COUNT).
  // Short uppercase words without underscores (OK, FAQ, GPS) are likely real UI labels.
  if (SCREAMING_SNAKE_RE.test(value) && value.includes('_')) return true

  // kebab-case: filter only if NO content words are present
  if (KEBAB_TECH_RE.test(value)) {
    const parts = value.split('-')
    const hasContentWord = parts.some(p => CONTENT_WORDS.has(p))
    if (!hasContentWord) return true
  }

  // Bare npm-like package names: all lowercase, no dashes with content words,
  // no spaces, < 40 chars. Single lowercase words are kept (could be content).
  if (/^[a-z][a-z0-9-]*$/.test(value) && value.length < 40 && !value.includes(' ')) {
    // Only filter if it has a slash (scoped package) or looks like a known package pattern
    // Single words or content-word kebab phrases pass through
    if (value.includes('/')) return true
  }

  return false
}

function looksLikeCssClasses(value: string): boolean {
  const tokens = value.split(/\s+/)
  if (tokens.length < 2) return false

  // If ALL tokens look like CSS utilities, filter
  const cssLikeCount = tokens.filter(t => isCssClassToken(t)).length
  return cssLikeCount === tokens.length
}

function isCssClassToken(token: string): boolean {
  // Tailwind-like: prefix- or modifier: patterns
  if (CSS_CLASS_PREFIX_RE.test(token)) return true
  // Common standalone classes
  if (/^(flex|grid|block|inline|hidden|container|relative|absolute|fixed|sticky|static|isolate|overflow-hidden|overflow-auto|overflow-scroll|underline|italic|uppercase|lowercase|capitalize|truncate|break-words|break-all|whitespace-nowrap|sr-only|not-sr-only)$/.test(token)) return true
  // Arbitrary Tailwind with brackets: w-[100px]
  if (/^[a-z]+-\[.+\]$/.test(token)) return true
  // Responsive/state prefixes: sm:text-lg, hover:bg-blue-500
  if (/^(sm|md|lg|xl|2xl|hover|focus|active|disabled|first|last|odd|even|dark|group-hover|peer-checked):/.test(token)) return true
  return false
}

// ─── Secondary filter for v2 candidates ───

/**
 * Apply legacy isNonContent filter as a secondary pass on v2 candidates.
 * This catches heuristic patterns (URLs, regex, camelCase identifiers, etc.)
 * that the structural pre-filter does not cover.
 */
function applySecondaryFilter(
  value: string,
  _surrounding: string,
  minLength: number,
  maxLength: number,
): boolean {
  // Pass empty lineContext — v2 pre-filter handles context-based detection (console, test, etc.)
  // Using surrounding would cause false positives because it spans +-1 lines
  return isNonContent(value, '', minLength, maxLength)
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

  const scanDirs = options?.paths ?? await autoDetectSourceDirs(projectRoot)
  const files = await discoverFiles(projectRoot, {
    paths: scanDirs,
    include: options?.include,
    exclude: options?.exclude,
  })

  const allCandidates: ScanCandidate[] = []
  const dupeMap = new Map<string, Array<{ file: string; line: number }>>()
  let rawStringsFound = 0

  const filePromises = files.map(async (relPath) => {
    const filePath = join(projectRoot, relPath)
    const content = await readText(filePath)
    if (!content) return { relPath, extractions: [] }

    const ext = extname(filePath)
    const extractions = await extractStrings(filePath, content, ext)
    return { relPath, extractions }
  })

  const fileResults = await Promise.all(filePromises)

  for (const { relPath, extractions } of fileResults) {
    rawStringsFound += extractions.length

    for (const extraction of extractions) {
      // Apply secondary (legacy) filter for heuristic patterns
      if (applySecondaryFilter(extraction.value, extraction.surrounding, minLength, maxLength)) continue

      const mappedContext = CONTEXT_MAP[extraction.context]

      const candidate: ScanCandidate = {
        file: relPath,
        line: extraction.line,
        column: extraction.column,
        value: extraction.value,
        context: mappedContext,
        surrounding: extraction.surrounding,
      }
      allCandidates.push(candidate)

      // Track duplicates
      const key = extraction.value
      if (!dupeMap.has(key)) {
        dupeMap.set(key, [])
      }
      dupeMap.get(key)!.push({ file: relPath, line: extraction.line })
    }
  }

  // Build duplicate groups (only count >= 2), sorted by count descending
  const duplicates: DuplicateGroup[] = [...dupeMap.entries()]
    .filter(([, occurrences]) => occurrences.length >= 2)
    .map(([value, occurrences]) => ({ value, count: occurrences.length, occurrences }))
    .toSorted((a, b) => b.count - a.count)

  // Pagination
  const afterFiltering = allCandidates.length
  const paginated = allCandidates.slice(offset, offset + limit)
  const hasMore = afterFiltering > offset + limit

  return {
    candidates: paginated,
    duplicates,
    stats: {
      files_scanned: files.length,
      raw_strings_found: rawStringsFound,
      after_filtering: afterFiltering,
      candidates_returned: paginated.length,
      has_more: hasMore,
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
        if (applySecondaryFilter(extraction.value, extraction.surrounding, minLength, maxLength)) continue
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
