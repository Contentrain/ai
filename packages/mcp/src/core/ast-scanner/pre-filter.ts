import type { ExtractedString, PreFilterRule } from './types.js'

// ─── Pre-filter Result ───

export interface PreFilterResult {
  /** Strings that passed the pre-filter (candidates for agent) */
  candidates: ExtractedString[]
  /** Total number of strings removed by the pre-filter */
  filtered: number
  /** Breakdown: reason string -> count of strings filtered for that reason */
  filterReasons: Record<string, number>
}

// ─── Value-based patterns (deterministic, no intelligence) ───

const PURE_NUMBER_RE = /^\d+(\.\d+)?$/
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i
const FILE_EXT_RE = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|scss|less|js|ts|tsx|jsx|json|md|html|xml|yaml|yml|woff|woff2|ttf|eot|mp4|webm|mp3|wav|pdf)$/i

// ─── Pre-filter Rules ───

const PRE_FILTER_RULES: PreFilterRule[] = [
  // Context-based rules (AST-determined, 100% accurate)
  { context: 'import_path', reason: 'import_path' },
  { context: 'type_annotation', reason: 'type_annotation' },
  { context: 'css_class', reason: 'css_class' },
  { context: 'css_utility_call', reason: 'css_utility_call' },
  { context: 'console_call', reason: 'console_call' },
  { context: 'test_assertion', reason: 'test_assertion' },
  { context: 'switch_case', reason: 'switch_case' },

  // Value-based rules (structural, not heuristic)
  { condition: (v) => v.length <= 1, reason: 'single_char' },
  { condition: (v) => PURE_NUMBER_RE.test(v), reason: 'pure_number' },
  { condition: (v) => v.startsWith('--'), reason: 'cli_flag' },
  { condition: (v) => HEX_COLOR_RE.test(v), reason: 'hex_color' },
  { condition: (v) => FILE_EXT_RE.test(v), reason: 'file_extension' },
]

// ─── Public API ───

/**
 * Structural pre-filter: removes strings that are 100% NOT content.
 *
 * Conservative — when in doubt, INCLUDE the string.
 * Returns candidates (passed), count of filtered, and reason breakdown.
 */
export function applyPreFilter(strings: ExtractedString[]): PreFilterResult {
  const candidates: ExtractedString[] = []
  const filterReasons: Record<string, number> = {}
  let filtered = 0

  for (const str of strings) {
    const matchedRule = findMatchingRule(str)

    if (matchedRule) {
      filtered++
      filterReasons[matchedRule.reason] = (filterReasons[matchedRule.reason] ?? 0) + 1
    } else {
      candidates.push(str)
    }
  }

  return { candidates, filtered, filterReasons }
}

/**
 * Find the first pre-filter rule that matches this string.
 * Returns the rule if matched, undefined if the string should pass through.
 */
function findMatchingRule(str: ExtractedString): PreFilterRule | undefined {
  for (const rule of PRE_FILTER_RULES) {
    if (rule.context !== undefined && str.context === rule.context) {
      return rule
    }
    if (rule.condition !== undefined && rule.condition(str.value)) {
      return rule
    }
  }
  return undefined
}
