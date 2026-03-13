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
const SURROUNDING_MAX = 120
const SUMMARY_SAMPLE_SIZE = 10

// ─── Pre-filter (pure, deterministic) ───

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

  // SCREAMING_SNAKE_CASE
  if (SCREAMING_SNAKE_RE.test(value)) return true

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

// ─── String Extraction ───

interface RawExtraction {
  value: string
  line: number
  column: number
  context: StringContext
  surrounding: string
}

const IMPORT_LINE_RE = /^\s*(import|export)\s/
const REQUIRE_LINE_RE = /require\s*\(/
const COMMENT_LINE_RE = /^\s*(\/\/|\/\*|\*)/

function extractStringsFromFile(content: string, isTemplateFile: boolean, isAstro: boolean): RawExtraction[] {
  const lines = content.split('\n')
  const results: RawExtraction[] = []
  let inTemplateBlock = false
  let inScriptBlock = false
  let inStyleBlock = false
  let inMultiLineComment = false
  let inAstroFrontmatter = false
  let astroFrontmatterCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const lineNum = i + 1
    const trimmed = line.trim()

    // Astro frontmatter detection: first `---` opens, second `---` closes
    if (isAstro) {
      if (trimmed === '---') {
        astroFrontmatterCount++
        if (astroFrontmatterCount === 1) {
          inAstroFrontmatter = true
          inScriptBlock = true
          continue
        }
        if (astroFrontmatterCount === 2) {
          inAstroFrontmatter = false
          inScriptBlock = false
          continue
        }
      }
      // Inside Astro frontmatter = script context (imports, logic)
      if (inAstroFrontmatter) {
        // Still extract strings but mark as script context
        // Skip import/require/comment lines as usual
        if (IMPORT_LINE_RE.test(line) || REQUIRE_LINE_RE.test(line)) continue
        if (COMMENT_LINE_RE.test(line)) continue
        extractQuotedStrings(line, lineNum, false, results)
        continue
      }
    }

    // Track template file sections (Vue, Svelte — NOT Astro, handled above)
    if (isTemplateFile && !isAstro) {
      if (/^<template[\s>]/.test(trimmed) || /^<template>$/.test(trimmed)) {
        inTemplateBlock = true
        inScriptBlock = false
        continue
      }
      if (trimmed === '</template>') {
        inTemplateBlock = false
        continue
      }
      if (/^<script[\s>]/.test(trimmed) || /^<script>$/.test(trimmed)) {
        inScriptBlock = true
        inTemplateBlock = false
        continue
      }
      if (trimmed === '</script>') {
        inScriptBlock = false
        continue
      }
      if (/^<style[\s>]/.test(trimmed) || /^<style>$/.test(trimmed)) {
        inStyleBlock = true
        continue
      }
      if (trimmed === '</style>') {
        inStyleBlock = false
        continue
      }
    }

    // Skip style blocks entirely
    if (inStyleBlock) continue

    // Track multi-line comments
    if (inMultiLineComment) {
      if (trimmed.includes('*/')) {
        inMultiLineComment = false
      }
      continue
    }
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inMultiLineComment = true
      continue
    }

    // Skip single-line comments
    if (COMMENT_LINE_RE.test(line)) continue

    // Skip import/require/export lines
    if (IMPORT_LINE_RE.test(line) || REQUIRE_LINE_RE.test(line)) continue

    const isInTemplate = isTemplateFile && (inTemplateBlock || (!inScriptBlock && !inStyleBlock && !inTemplateBlock))
    // For Astro: after frontmatter closes, everything is template
    const isAstroTemplate = isAstro && !inAstroFrontmatter && astroFrontmatterCount >= 2

    const effectiveTemplate = isInTemplate || isAstroTemplate

    // Extract JSX/template text (unquoted content between tags)
    extractTagText(line, lineNum, effectiveTemplate, results)

    // Extract quoted string literals
    extractQuotedStrings(line, lineNum, effectiveTemplate, results)
  }

  // Second pass: detect multiline tag text (content split across lines)
  extractMultilineTagText(lines, results)

  return results
}

function extractTagText(
  line: string,
  lineNum: number,
  isTemplate: boolean,
  results: RawExtraction[],
): void {
  // Match text content between > and <
  const tagTextRe = />([^<>{]+)</g
  let match: RegExpExecArray | null

  while ((match = tagTextRe.exec(line)) !== null) {
    const text = match[1]!.trim()
    if (text.length === 0) continue
    // Skip if it looks like just whitespace or punctuation
    if (/^[\s\W]*$/.test(text) && !/[a-zA-Z]/.test(text)) continue

    results.push({
      value: text,
      line: lineNum,
      column: match.index + 1 + (match[0].indexOf(match[1]!)),
      context: isTemplate ? 'template_text' : 'jsx_text',
      surrounding: line.slice(0, SURROUNDING_MAX),
    })
  }
}

/**
 * Second-pass heuristic: detect text content that spans multiple lines between tags.
 *
 * Looks for a line ending with `>` (tag opened) where the closing `</` appears on a
 * later line. Collects intermediate lines and treats them as potential text content.
 *
 * Conservative: skips if the accumulated text contains code-like patterns (braces,
 * JSX expressions, ternaries, function calls) to avoid false positives.
 */
function extractMultilineTagText(
  lines: string[],
  results: RawExtraction[],
): void {
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trim()

    // Look for a line that ends with `>` (after trimming) but does NOT contain `</`
    // on the same line — i.e. an opening tag whose text continues on the next line.
    // Also skip self-closing tags (`/>`) and lines that already have `>...<` matched
    // by the single-line extractor.
    if (
      trimmed.endsWith('>')
      && !trimmed.endsWith('/>')
      && !trimmed.includes('</')
      // Must have an opening tag on this line
      && /<[a-zA-Z]/.test(trimmed)
    ) {
      const startLine = i + 1 // 1-based line of text start
      const textParts: string[] = []
      let j = i + 1

      // Collect subsequent lines until we hit the closing tag
      while (j < lines.length) {
        const nextTrimmed = lines[j]!.trim()

        // Stop at closing tag
        if (nextTrimmed.startsWith('</') || nextTrimmed.includes('</')) {
          // If the closing-tag line has text before `</`, grab it
          const beforeClose = nextTrimmed.split('</')[0]!.trim()
          if (beforeClose.length > 0) {
            textParts.push(beforeClose)
          }
          break
        }

        // Stop at another opening tag (nested element) — too complex
        if (/<[a-zA-Z]/.test(nextTrimmed)) break

        // Stop if line looks like code: braces, ternary, JSX expression, assignment
        if (/[{}();=]/.test(nextTrimmed)) break

        if (nextTrimmed.length > 0) {
          textParts.push(nextTrimmed)
        }
        j++
      }

      if (textParts.length > 0) {
        const combined = textParts.join(' ').trim()

        // Only keep if it looks like user-facing content (has letters, no code patterns)
        if (
          combined.length > 0
          && /[a-zA-Z]/.test(combined)
          && !/[{}();=]/.test(combined)
        ) {
          results.push({
            value: combined,
            line: startLine + 1, // 1-based
            column: 1,
            context: 'jsx_text',
            surrounding: lines[startLine]?.slice(0, SURROUNDING_MAX) ?? '',
          })
        }
      }

      // Advance past the collected lines
      i = j + 1
      continue
    }

    i++
  }
}

function extractQuotedStrings(
  line: string,
  lineNum: number,
  isTemplate: boolean,
  results: RawExtraction[],
): void {
  // Match single-quoted, double-quoted, and simple template literals (no expressions)
  const strings = extractStringLiterals(line)

  for (const { value, startCol } of strings) {
    if (value.length === 0) continue

    const context = determineContext(line, startCol, isTemplate)

    results.push({
      value,
      line: lineNum,
      column: startCol + 1, // 1-based
      context,
      surrounding: line.slice(0, SURROUNDING_MAX),
    })
  }
}

interface ExtractedLiteral {
  value: string
  startCol: number // 0-based index in the line
}

function extractStringLiterals(line: string): ExtractedLiteral[] {
  const results: ExtractedLiteral[] = []
  let i = 0

  while (i < line.length) {
    const ch = line[i]

    // Skip escaped characters
    if (ch === '\\') {
      i += 2
      continue
    }

    // Single-line comment — stop processing
    if (ch === '/' && i + 1 < line.length && line[i + 1] === '/') {
      break
    }

    // Inline block comment — skip over it
    if (ch === '/' && i + 1 < line.length && line[i + 1] === '*') {
      const endIdx = line.indexOf('*/', i + 2)
      if (endIdx === -1) break // rest of line is comment
      i = endIdx + 2
      continue
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      const quote = ch
      const startCol = i
      i++ // skip opening quote
      let value = ''
      let closed = false

      while (i < line.length) {
        const c = line[i]
        if (c === '\\') {
          // Handle common escape sequences
          if (i + 1 < line.length) {
            const next = line[i + 1]
            switch (next) {
              case 'n': value += '\n'; break
              case 't': value += '\t'; break
              case 'r': value += '\r'; break
              case '\\': value += '\\'; break
              case '\'': value += '\''; break
              case '"': value += '"'; break
              case '`': value += '`'; break
              default: value += next; break
            }
            i += 2
          } else {
            i++
          }
          continue
        }
        if (c === quote) {
          closed = true
          i++ // skip closing quote
          break
        }
        // For template literals, skip embedded expressions ${...}
        if (quote === '`' && c === '$' && i + 1 < line.length && line[i + 1] === '{') {
          // Template literal with expressions — skip the whole thing as it's complex
          // Find the matching }, accounting for nesting
          let depth = 1
          i += 2 // skip ${
          while (i < line.length && depth > 0) {
            if (line[i] === '{') depth++
            else if (line[i] === '}') depth--
            if (depth > 0) i++
            else { i++; break }
          }
          // Mark as having expressions; we skip these template literals
          value = ''
          closed = false
          // Continue to find the closing backtick to skip properly
          while (i < line.length) {
            if (line[i] === '`') { i++; break }
            if (line[i] === '$' && i + 1 < line.length && line[i + 1] === '{') {
              depth = 1
              i += 2
              while (i < line.length && depth > 0) {
                if (line[i] === '{') depth++
                else if (line[i] === '}') depth--
                if (depth > 0) i++
                else { i++; break }
              }
            } else {
              i++
            }
          }
          break
        }
        value += c
        i++
      }

      if (closed && value.length > 0) {
        results.push({ value, startCol })
      }
      continue
    }

    i++
  }

  return results
}

function determineContext(line: string, stringStartCol: number, isTemplate: boolean): StringContext {
  const beforeString = line.slice(0, stringStartCol).trimEnd()

  // JSX/template attribute: string in attribute position
  // Look for pattern: attributeName= or attributeName={
  if (/[a-zA-Z0-9_-]+=\{?\s*$/.test(beforeString) || /[a-zA-Z0-9_-]+=\s*$/.test(beforeString)) {
    // Check if this looks like JSX/template context
    if (isTemplate) return 'template_attribute'
    // For JSX files, check if there's a < somewhere before (we're inside a tag)
    if (lineHasJsxContext(line)) return 'jsx_attribute'
  }

  // Variable assignment: const/let/var x = "value"
  if (/\b(const|let|var)\s+\w+\s*=\s*$/.test(beforeString)) return 'variable_assignment'

  // Also catch: const x: type = "value"
  if (/\b(const|let|var)\s+\w+\s*:\s*\w+\s*=\s*$/.test(beforeString)) return 'variable_assignment'

  // Function argument: string inside parentheses
  // Check if there's an unmatched open paren before
  if (isInsideParens(beforeString)) return 'function_argument'

  // Object value: string follows ':'
  if (/:\s*$/.test(beforeString)) return 'object_value'

  // Assignment to property or variable (not const/let/var)
  if (/=\s*$/.test(beforeString) && !/[=!<>]=\s*$/.test(beforeString)) return 'variable_assignment'

  return 'other'
}

function lineHasJsxContext(line: string): boolean {
  // Simple heuristic: line contains < and either ends with > or has attributes
  return /<[A-Z]/.test(line) || /<[a-z]+[\s>]/.test(line)
}

function isInsideParens(before: string): boolean {
  let depth = 0
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i]
    if (ch === ')') depth++
    else if (ch === '(') {
      if (depth === 0) return true
      depth--
    }
  }
  return false
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

  for (const relPath of files) {
    const filePath = join(projectRoot, relPath)
    const content = await readText(filePath)
    if (!content) continue

    const ext = extname(filePath)
    const isAstro = ext === '.astro'
    const isTemplateFile = ['.vue', '.svelte', '.astro'].includes(ext)

    const extractions = extractStringsFromFile(content, isTemplateFile, isAstro)
    rawStringsFound += extractions.length

    for (const extraction of extractions) {
      if (isNonContent(extraction.value, extraction.surrounding, minLength, maxLength)) continue

      const candidate: ScanCandidate = {
        file: relPath,
        line: extraction.line,
        column: extraction.column,
        value: extraction.value,
        context: extraction.context,
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

    for (const relPath of sampleFiles) {
      const filePath = join(projectRoot, relPath)
      const content = await readText(filePath)
      if (!content) continue

      const ext = extname(filePath)
      const isAstro = ext === '.astro'
      const isTemplateFile = ['.vue', '.svelte', '.astro'].includes(ext)
      const extractions = extractStringsFromFile(content, isTemplateFile, isAstro)

      for (const extraction of extractions) {
        if (isNonContent(extraction.value, extraction.surrounding, minLength, maxLength)) continue
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
    file_types: fileTypes,
  }
}
