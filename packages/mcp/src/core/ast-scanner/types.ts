// ─── Scanner v2 Types ───

/**
 * Structural context determined by AST parent-chain analysis.
 * Scanner assigns context based on syntax structure only — no intelligence.
 */
export type StructuralContext =
  // Template / JSX
  | 'template_text'
  | 'template_attribute'
  | 'jsx_text'
  | 'jsx_attribute'

  // Script
  | 'variable_assignment'
  | 'object_property'
  | 'function_argument'
  | 'array_element'
  | 'enum_value'
  | 'template_literal'

  // Pre-filtered (deterministic skip — removed before output)
  | 'import_path'
  | 'type_annotation'
  | 'css_class'
  | 'css_utility_call'
  | 'switch_case'
  | 'console_call'
  | 'test_assertion'

  // Fallback
  | 'other'

/**
 * A string extracted from source code with structural metadata.
 * The scanner does NOT classify strings as "UI" or "code" —
 * it provides structural context for the agent to decide.
 */
export interface ExtractedString {
  /** The string value (trimmed for JSX text) */
  value: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
  /** Structural context determined by AST parent chain */
  context: StructuralContext
  /** Whether the string is in template or script scope */
  scope: 'template' | 'script'
  /** Parent node description: tag name, function name, variable name, property key */
  parent: string
  /** If inside an object property, the key name */
  parentProperty?: string
  /** Surrounding code (+-1 line, max 120 chars) */
  surrounding: string
}

/**
 * Pre-filter rule: deterministic skip rule for structural pre-filtering.
 * Each rule either matches by context type, a value condition, or a full-object match.
 */
export interface PreFilterRule {
  /** Skip strings with this structural context */
  context?: StructuralContext
  /** Skip strings matching this value condition */
  condition?: (value: string) => boolean
  /** Skip strings matching this full-object condition (has access to parent, parentProperty, etc.) */
  match?: (str: ExtractedString) => boolean
  /** Human-readable reason for filtering */
  reason: string
}
