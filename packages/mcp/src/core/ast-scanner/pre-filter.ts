import type { ExtractedString } from './types.js'

// ─── Pre-filter Result ───

export interface PreFilterResult {
  /** Strings that passed the pre-filter (candidates for agent) */
  candidates: ExtractedString[]
  /** Total number of strings removed by shouldSkip */
  skipped: number
  /** Total number of strings removed by low content score */
  lowConfidence: number
  /** Breakdown: skip reason → count */
  skipReasons: Record<string, number>
}

// ─── Value-based regexes ───

const PURE_NUMBER_RE = /^-?\d+(\.\d+)?$/
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i
const FILE_EXT_RE = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|scss|less|js|ts|tsx|jsx|json|md|html|xml|yaml|yml|woff|woff2|ttf|eot|mp4|webm|mp3|wav|pdf)$/i
const SVG_PATH_DATA_RE = /^[Mm][\d\s.,LHVCSQTAZlhvcsqtazmMzZ-]+$/
const SVG_VIEWBOX_RE = /^\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?$/
const I18N_KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/
const TECHNICAL_IDENTIFIER_RE = /^[_a-z][a-z0-9_-]*$/
const ERROR_CODE_RE = /^[A-Z][A-Z0-9_]+$/
const PLACEHOLDER_RE = /^\{\d+\}$|^\.{2,}$/
const CAMEL_CASE_RE = /^[a-z]+[A-Z]/
const LOCALE_CODE_RE = /^[a-z]{2}[-_][A-Z]{2}$/
const DIMENSION_RE = /^\d+[x×]\d+$/
const REPEAT_CHAR_RE = /^(.)\1{3,}$/
const MIME_TYPE_RE = /^(application|text|image|audio|video|multipart|font)\/[\w.+-]+$/
const PASCAL_CASE_RE = /^[A-Z][a-z]+[A-Z]/

const HTML_TARGETS = new Set(['_blank', '_self', '_parent', '_top'])

// ─── URL / path detection (consolidated from legacy isNonContent) ───

function isURLLike(str: string): boolean {
  if (/^(https?|ftp|file|mailto|data):/.test(str)) return true
  if (/^(\.\.?\/|\/|[A-Za-z]:\\)/.test(str)) return true
  if (/^['"]?[@a-z][\w-]*/.test(str.toLowerCase()) && !str.includes(' ') && (str.includes('/') || str.includes('.'))) {
    return true
  }
  return false
}

// ─── CSS / Tailwind detection ───

const TAILWIND_SEGMENT_RE = /^(?:bg-|text-|border-|flex|grid|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|rounded|shadow|w-|h-|min-|max-|gap-|space-|items-|justify-|self-|overflow-|z-|opacity-|transition|duration-|ease-|animate-|font-|leading-|tracking-|decoration-|underline|line-through|uppercase|lowercase|capitalize|truncate|whitespace-|break-|sr-only|not-sr-only|hover:|focus:|active:|disabled:|dark:|sm:|md:|lg:|xl:|2xl:|group-|peer-|ring-|outline-|divide-|table-|col-|row-|aspect-|object-|inset-|top-|right-|bottom-|left-|translate-|rotate-|scale-|skew-|origin-|cursor-|select-|resize-|fill-|stroke-|block|inline|absolute|relative|fixed|sticky|static|float-|clear-|isolate|visible|invisible|grow|shrink|basis-|order-|place-)/

function isCssClassList(value: string): boolean {
  const segments = value.trim().split(/\s+/)
  if (segments.length < 2) return false
  let matched = 0
  for (const seg of segments) {
    if (TAILWIND_SEGMENT_RE.test(seg)) matched++
  }
  return matched / segments.length >= 0.5
}

function isSingleCssUtility(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.includes(' ')) return false
  return TAILWIND_SEGMENT_RE.test(trimmed)
}

// ─── SVG technical attributes ───

const SVG_TECHNICAL_ATTRIBUTES = new Set([
  'd', 'viewBox', 'points', 'transform', 'pathLength',
  'xmlns', 'preserveAspectRatio',
  'stroke-linecap', 'stroke-linejoin', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
  'fill-rule', 'clip-rule',
])

const SVG_GRAPHIC_ELEMENTS = new Set([
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
  'ellipse', 'g', 'defs', 'use', 'symbol', 'clipPath', 'mask',
  'pattern', 'linearGradient', 'radialGradient', 'stop',
  'marker', 'animate', 'animateTransform', 'image',
])

// ─── Known function names ───

const I18N_FUNCTIONS = new Set([
  't', '$t', 'i18n', 'translate', 'formatMessage', 'msg',
])

const EMIT_FUNCTIONS = new Set([
  'emit', '$emit',
])

// ─── Translatable attribute whitelist (i18next-cli compatible + extended) ───

const TRANSLATABLE_ATTRIBUTES = new Set([
  // Standard HTML content attributes
  'title', 'alt', 'placeholder', 'label', 'summary', 'caption',
  'abbr', 'accesskey', 'content', 'description',
  // ARIA content
  'aria-label', 'aria-description', 'aria-placeholder',
  'aria-roledescription', 'aria-valuetext',
  // React Native accessibility (equivalent to aria-label)
  'accessibilityLabel', 'accessibilityHint', 'accessibilityValue',
  // Common component content props
  'heading', 'subheading', 'message', 'hint', 'tooltip',
  'helper-text', 'error-message', 'success-message',
  'confirm-text', 'cancel-text', 'empty-text', 'loading-text',
  'no-data-text', 'no-results-text',
])

// ─── Translatable object property whitelist (i18next-cli compatible) ───

const TRANSLATABLE_PROPERTIES = new Set([
  'label', 'title', 'description', 'text', 'message', 'placeholder',
  'caption', 'summary', 'heading', 'subheading', 'subtitle', 'tooltip',
  'hint', 'helpText', 'errorMessage', 'successMessage', 'name',
])

// ─── shouldSkip: Binary non-content detection ───

/**
 * Determines if a string is definitely NOT user-visible content.
 * Returns skip reason if it should be filtered, null if it should proceed to scoring.
 *
 * Conservative for template_text/jsx_text (tag-between text is almost always content).
 * Aggressive for everything else (technical tokens, config values, framework artifacts).
 */
export function shouldSkip(str: ExtractedString): string | null {
  // ── Context-based rules (AST-determined, 100% accurate) ──

  if (str.context === 'import_path') return 'import_path'
  if (str.context === 'type_annotation') return 'type_annotation'
  if (str.context === 'css_class') return 'css_class'
  if (str.context === 'css_utility_call') return 'css_utility_call'
  if (str.context === 'console_call') return 'console_call'
  if (str.context === 'test_assertion') return 'test_assertion'
  if (str.context === 'switch_case') return 'switch_case'

  const v = str.value

  // ── Value-based rules (structural patterns) ──

  if (v.length <= 1) return 'single_char'
  if (/^\s+$/.test(v)) return 'whitespace'
  if (PURE_NUMBER_RE.test(v)) return 'pure_number'
  if (HEX_COLOR_RE.test(v)) return 'hex_color'
  if (FILE_EXT_RE.test(v)) return 'file_extension'
  if (v.startsWith('--')) return 'cli_flag'

  // ── i18n key paths (checked before URL — both contain dots, but i18n keys are more specific) ──

  if (I18N_KEY_RE.test(v)) return 'i18n_key'

  // ── MIME types (checked before URL — both contain slash, MIME is more specific) ──

  if (MIME_TYPE_RE.test(v)) return 'mime_type'

  // ── URL/path patterns ──

  if (isURLLike(v)) return 'url_path'

  // ── CSS patterns ──

  if (isCssClassList(v)) return 'css_class_list'
  if (isSingleCssUtility(v)) return 'css_utility_token'

  // ── SVG patterns ──

  if (v.length > 3 && SVG_PATH_DATA_RE.test(v)) return 'svg_path_data'
  if (SVG_VIEWBOX_RE.test(v)) return 'svg_viewbox'
  if (str.parentProperty !== undefined && SVG_TECHNICAL_ATTRIBUTES.has(str.parentProperty)) return 'svg_technical_attr'
  if (str.context === 'template_attribute' && SVG_GRAPHIC_ELEMENTS.has(str.parent)) return 'svg_element_attr'

  // ── Framework event patterns ──

  if (v.startsWith('update:')) return 'vue_emit_event'

  // ── Placeholder / interpolation ──

  if (PLACEHOLDER_RE.test(v)) return 'placeholder'

  // ── Structural value patterns (100% non-content) ──

  if (LOCALE_CODE_RE.test(v)) return 'locale_code'
  if (DIMENSION_RE.test(v)) return 'dimension'
  if (REPEAT_CHAR_RE.test(v)) return 'repeat_chars'
  if (HTML_TARGETS.has(v)) return 'html_target'

  // ── Known function argument detection ──

  if (str.context === 'function_argument' && I18N_FUNCTIONS.has(str.parent)) {
    // i18n function args: filter lowercase identifiers (namespace/key), keep sentences
    if (/^[a-z][a-z0-9_.-]*$/.test(v)) return 'i18n_function_arg'
  }

  if (str.context === 'function_argument' && EMIT_FUNCTIONS.has(str.parent)) {
    return 'emit_event_arg'
  }

  // ── CRITICAL: Technical identifier detection (i18next-cli proven pattern) ──
  // Single lowercase ASCII word/kebab-case/snake_case < 30 chars → technical token
  // EXEMPT: template_text and jsx_text (tag-between text IS content, even lowercase)

  if (str.context !== 'template_text' && str.context !== 'jsx_text') {
    if (TECHNICAL_IDENTIFIER_RE.test(v) && v.length < 30) {
      return 'technical_identifier'
    }
  }

  // ── Error codes (SCREAMING_SNAKE_CASE with underscores) ──

  if (ERROR_CODE_RE.test(v) && v.includes('_') && v.length > 3) {
    return 'error_code'
  }

  return null
}

// ─── calculateContentScore: 0-1 confidence scoring ───

/**
 * Calculates a content confidence score (0-1) for a string that passed shouldSkip.
 * Uses AST context metadata (our advantage over offset-based tools) combined with
 * value-based signals proven by i18next-cli.
 *
 * Base score: 0.5. Boosted/penalized by context and value characteristics.
 */
export function calculateContentScore(str: ExtractedString): number {
  let score = 0.5

  // ── Context signals (AST metadata advantage) ──

  // Template/JSX text = almost certainly user-visible content
  if (str.context === 'template_text' || str.context === 'jsx_text') {
    score += 0.3
  }

  // Content-bearing attribute (title, alt, placeholder, aria-label, etc.)
  if (str.context === 'template_attribute' || str.context === 'jsx_attribute') {
    if (str.parentProperty && TRANSLATABLE_ATTRIBUTES.has(str.parentProperty)) {
      score += 0.2
    } else {
      score -= 0.2  // Unknown/technical attribute
    }
  }

  // Content-bearing object property (message, label, description, etc.)
  if (str.context === 'object_property') {
    if (str.parentProperty && TRANSLATABLE_PROPERTIES.has(str.parentProperty)) {
      score += 0.25
    }
  }

  // ── Value signals (i18next-cli proven heuristics) ──

  // Multi-word strings are more likely content
  const wordCount = str.value.split(/\s+/).length
  if (wordCount >= 3) score += 0.2
  else if (wordCount === 2) score += 0.1

  // Terminal punctuation suggests a sentence
  if (/[.!?:;]$/.test(str.value)) score += 0.1

  // Non-ASCII characters (Turkish, Chinese, Arabic, etc.) → almost certainly content
  if (/[\u0080-\uFFFF]/.test(str.value)) score += 0.15

  // Capitalized first letter with lowercase body (Dashboard, Kaydet, Settings)
  if (/^[A-Z]/.test(str.value) && /[a-z]/.test(str.value)) score += 0.1

  // camelCase → probably a technical identifier
  if (CAMEL_CASE_RE.test(str.value)) score -= 0.3

  // PascalCase with internal uppercase (PhGameController, GameCard) → likely component/icon name
  // Does NOT match single-uppercase words (Dashboard, Karadeniz, Settings)
  if (PASCAL_CASE_RE.test(str.value) && !str.value.includes(' ')) score -= 0.25

  // Short ALL-CAPS (TRY, GET, USD) → likely code/abbreviation, not content
  // In template_text the +0.3 context boost keeps real labels like "FAQ" above threshold
  if (/^[A-Z]{2,5}$/.test(str.value)) score -= 0.15

  // Contains slash without spaces → path-like
  if (str.value.includes('/') && !str.value.includes(' ')) score -= 0.2

  return Math.max(0, Math.min(1, score))
}

// ─── Public API ───

/**
 * Two-phase pre-filter:
 * 1. shouldSkip(): Binary removal of definite non-content
 * 2. calculateContentScore(): 0-1 confidence scoring for ambiguous strings
 *
 * Returns candidates that passed both phases, with content scores attached.
 */
export function applyPreFilter(
  strings: ExtractedString[],
  minScore: number = 0.4,
): PreFilterResult {
  const candidates: ExtractedString[] = []
  const skipReasons: Record<string, number> = {}
  let skipped = 0
  let lowConfidence = 0

  for (const str of strings) {
    // Phase 1: Binary skip
    const skipReason = shouldSkip(str)
    if (skipReason) {
      skipped++
      skipReasons[skipReason] = (skipReasons[skipReason] ?? 0) + 1
      continue
    }

    // Phase 2: Content scoring
    const contentScore = calculateContentScore(str)
    if (contentScore < minScore) {
      lowConfidence++
      skipReasons['low_confidence'] = (skipReasons['low_confidence'] ?? 0) + 1
      continue
    }

    // Attach score to the extraction for downstream use
    ;(str as ExtractedString & { contentScore: number }).contentScore = contentScore
    candidates.push(str)
  }

  return { candidates, skipped, lowConfidence, skipReasons }
}
