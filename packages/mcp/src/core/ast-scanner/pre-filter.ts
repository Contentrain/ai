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

// ─── HTML / component prop technical values ───

const HTML_PROP_VALUES = new Set([
  // CSS / variant keywords
  'class', 'variant', 'secondary', 'outline', 'ghost', 'destructive', 'default', 'primary',
  // Link / target
  '_blank', 'noopener', 'noreferrer',
  // Input / button types
  'button', 'submit', 'reset', 'text', 'numeric', 'password', 'email', 'checkbox', 'radio',
  // Layout / display
  'hidden', 'none', 'auto', 'inherit', 'initial',
  // Size tokens
  'sm', 'md', 'lg', 'xl', 'xs', '2xl', '3xl',
  // Icon variants
  'icon', 'icon-sm', 'icon-lg',
])

// ─── Slot / event technical names (single lowercase word) ───

const SLOT_EVENT_NAMES = new Set([
  'header', 'footer', 'default', 'trigger', 'content',
  'sidebar', 'overlay', 'body', 'actions',
  'click', 'change', 'input', 'focus', 'blur', 'submit',
  'mounted', 'unmounted', 'updated',
])

// ─── Tailwind / CSS utility detection ───

const TAILWIND_SEGMENT_RE = /^(?:bg-|text-|border-|flex|grid|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|rounded|shadow|w-|h-|min-|max-|gap-|space-|items-|justify-|self-|overflow-|z-|opacity-|transition|duration-|ease-|animate-|font-|leading-|tracking-|decoration-|underline|line-through|uppercase|lowercase|capitalize|truncate|whitespace-|break-|sr-only|not-sr-only|hover:|focus:|active:|disabled:|dark:|sm:|md:|lg:|xl:|2xl:|group-|peer-|ring-|outline-|divide-|table-|col-|row-|aspect-|object-|inset-|top-|right-|bottom-|left-|translate-|rotate-|scale-|skew-|origin-|cursor-|select-|resize-|fill-|stroke-|block|inline|absolute|relative|fixed|sticky|static|float-|clear-|isolate|visible|invisible|grow|shrink|basis-|order-|place-)/

/**
 * Returns true if the string looks like a CSS class list (Tailwind or similar).
 * Requires 2+ space-separated segments with majority matching utility patterns.
 */
function isCssClassList(value: string): boolean {
  const segments = value.trim().split(/\s+/)
  if (segments.length < 2) return false
  let matched = 0
  for (const seg of segments) {
    if (TAILWIND_SEGMENT_RE.test(seg)) matched++
  }
  return matched / segments.length >= 0.5
}

/**
 * Returns true if the string is a single CSS utility token (e.g. "bg-blue-500").
 */
function isSingleCssUtility(value: string): boolean {
  const trimmed = value.trim()
  // Must be a single token, no spaces
  if (trimmed.includes(' ')) return false
  return TAILWIND_SEGMENT_RE.test(trimmed)
}

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

  // HTML / component prop technical values (exact match, case-insensitive)
  { condition: (v) => HTML_PROP_VALUES.has(v.toLowerCase()), reason: 'html_prop_value' },

  // CSS class lists (Tailwind-style multi-segment strings)
  { condition: (v) => isCssClassList(v), reason: 'css_class_list' },

  // Single CSS utility token (e.g. "bg-blue-500", "rounded-lg")
  { condition: (v) => isSingleCssUtility(v), reason: 'css_utility_token' },

  // Slot / event technical names (single lowercase word only)
  { condition: (v) => {
    const lower = v.toLowerCase()
    return v === lower && !v.includes(' ') && SLOT_EVENT_NAMES.has(lower)
  }, reason: 'slot_event_name' },
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
