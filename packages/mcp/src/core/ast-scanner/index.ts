import type { ExtractedString } from './types.js'
import { applyPreFilter } from './pre-filter.js'
import { parseTsx } from './tsx-parser.js'

// ─── Extension sets ───

const TSX_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs'])
const VUE_EXTENSIONS = new Set(['.vue'])
const SVELTE_EXTENSIONS = new Set(['.svelte'])
const ASTRO_EXTENSIONS = new Set(['.astro'])

// ─── Lazy-loaded parsers ───

/**
 * Lazily import vue-parser. Returns undefined if not available
 * (@vue/compiler-sfc is an optional dependency).
 */
async function loadVueParser(): Promise<((content: string, fileName: string) => Promise<ExtractedString[]> | ExtractedString[]) | undefined> {
  try {
    const mod = await import('./vue-parser.js')
    return mod.parseVue
  } catch {
    return undefined
  }
}

/**
 * Lazily import svelte-parser. Returns undefined if not available
 * (svelte is an optional dependency).
 */
async function loadSvelteParser(): Promise<((content: string, fileName: string) => Promise<ExtractedString[]>) | undefined> {
  try {
    const mod = await import('./svelte-parser.js')
    return mod.parseSvelte
  } catch {
    return undefined
  }
}

/**
 * Lazily import astro-parser. Returns undefined if not available
 * (@astrojs/compiler is an optional dependency).
 */
async function loadAstroParser(): Promise<((content: string, fileName: string) => Promise<ExtractedString[]>) | undefined> {
  try {
    const mod = await import('./astro-parser.js')
    return mod.parseAstro
  } catch {
    return undefined
  }
}

// ─── Regex fallback for unknown extensions ───

const SURROUNDING_MAX = 120

/**
 * Minimal regex-based extractor for file types without AST parsers.
 * Extracts quoted strings and tag text — conservative, low accuracy.
 * Used as fallback when dedicated parsers are unavailable.
 */
function extractWithRegex(content: string, _filePath: string): ExtractedString[] {
  const lines = content.split('\n')
  const results: ExtractedString[] = []

  // Simple quoted string extraction
  const stringRe = /(['"`])(?:(?!\1|\\).|\\.)*?\1/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()

    // Skip comments, imports
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
    if (/^\s*(import|export)\s/.test(line)) continue

    let match: RegExpExecArray | null
    stringRe.lastIndex = 0

    while ((match = stringRe.exec(line)) !== null) {
      // Remove surrounding quotes
      const raw = match[0]
      const value = raw.slice(1, -1)
      if (value.length === 0) continue

      const surrounding = buildSurrounding(lines, i)

      results.push({
        value,
        line: i + 1,
        column: match.index + 1,
        context: 'other',
        scope: 'script',
        parent: '',
        surrounding,
      })
    }

    // Tag text extraction: >text<
    const tagTextRe = />([^<>{]+)</g
    let tagMatch: RegExpExecArray | null
    tagTextRe.lastIndex = 0

    while ((tagMatch = tagTextRe.exec(line)) !== null) {
      const text = tagMatch[1]!.trim()
      if (text.length === 0) continue
      if (/^[\s\W]*$/.test(text) && !/[a-zA-Z]/.test(text)) continue

      results.push({
        value: text,
        line: i + 1,
        column: tagMatch.index + 1,
        context: 'template_text',
        scope: 'template',
        parent: '',
        surrounding: buildSurrounding(lines, i),
      })
    }
  }

  return results
}

function buildSurrounding(lines: string[], lineIdx: number): string {
  const start = Math.max(0, lineIdx - 1)
  const end = Math.min(lines.length - 1, lineIdx + 1)

  const parts: string[] = []
  for (let i = start; i <= end; i++) {
    const line = lines[i]
    if (line !== undefined) {
      parts.push(line)
    }
  }

  const joined = parts.join('\n')
  if (joined.length > SURROUNDING_MAX) {
    return joined.slice(0, SURROUNDING_MAX)
  }
  return joined
}

// ─── Public API ───

/**
 * Extract strings from a source file with structural context.
 *
 * Routes to the correct parser based on file extension:
 * - .tsx/.jsx/.ts/.js/.mjs -> tsx-parser (AST-based)
 * - .vue -> vue-parser (lazy-loaded, AST-based)
 * - .svelte -> svelte-parser (lazy-loaded, AST-based)
 * - .astro -> astro-parser (lazy-loaded, AST-based)
 * - unknown -> empty array
 *
 * Falls back to regex extraction when the dedicated parser's
 * optional dependency is not installed.
 *
 * Applies structural pre-filter to remove 100% non-content strings.
 * Returns only candidates that should be sent to the agent.
 */
export async function extractStrings(
  filePath: string,
  content: string,
  ext: string,
): Promise<ExtractedString[]> {
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`
  let rawStrings: ExtractedString[]

  if (TSX_EXTENSIONS.has(normalizedExt)) {
    rawStrings = parseTsx(content, filePath)
  } else if (VUE_EXTENSIONS.has(normalizedExt)) {
    const parseVue = await loadVueParser()
    if (parseVue) {
      rawStrings = await parseVue(content, filePath)
    } else {
      rawStrings = extractWithRegex(content, filePath)
    }
  } else if (SVELTE_EXTENSIONS.has(normalizedExt)) {
    const parseSvelte = await loadSvelteParser()
    if (parseSvelte) {
      try {
        rawStrings = await parseSvelte(content, filePath)
      } catch {
        // svelte/compiler not installed — fall back to regex
        rawStrings = extractWithRegex(content, filePath)
      }
    } else {
      rawStrings = extractWithRegex(content, filePath)
    }
  } else if (ASTRO_EXTENSIONS.has(normalizedExt)) {
    const parseAstro = await loadAstroParser()
    if (parseAstro) {
      try {
        rawStrings = await parseAstro(content, filePath)
      } catch {
        // @astrojs/compiler not installed — fall back to regex
        rawStrings = extractWithRegex(content, filePath)
      }
    } else {
      rawStrings = extractWithRegex(content, filePath)
    }
  } else {
    return []
  }

  // Apply structural pre-filter
  const { candidates } = applyPreFilter(rawStrings)
  return candidates
}

// Re-export types for convenience
export type { ExtractedString, StructuralContext, PreFilterRule } from './types.js'
export { applyPreFilter, shouldSkip, calculateContentScore } from './pre-filter.js'
export type { PreFilterResult } from './pre-filter.js'
