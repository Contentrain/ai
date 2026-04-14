import { describe, expect, it } from 'vitest'
import { applyPreFilter, shouldSkip, calculateContentScore } from '../../../src/core/ast-scanner/pre-filter.js'
import type { ExtractedString, StructuralContext } from '../../../src/core/ast-scanner/types.js'

// ─── Helper ───

function makeString(
  value: string,
  context: StructuralContext = 'other',
  overrides: Partial<ExtractedString> = {},
): ExtractedString {
  return {
    value,
    line: 1,
    column: 1,
    context,
    scope: 'script',
    parent: '',
    surrounding: '',
    ...overrides,
  }
}

// ─── shouldSkip: Context-based rules ───

describe('shouldSkip', () => {
  describe('context-based rules', () => {
    it.each([
      ['import_path', './utils/helper'],
      ['type_annotation', 'string'],
      ['css_class', 'bg-blue-500 text-white'],
      ['css_utility_call', 'flex items-center'],
      ['console_call', 'User logged in'],
      ['test_assertion', 'should render correctly'],
      ['switch_case', 'active'],
    ] satisfies Array<[StructuralContext, string]>)('filters %s context', (context, value) => {
      const result = shouldSkip(makeString(value, context))
      expect(result).toBe(context)
    })
  })

  describe('value-based rules', () => {
    it('filters single character strings', () => {
      expect(shouldSkip(makeString('x'))).toBe('single_char')
      expect(shouldSkip(makeString('.'))).toBe('single_char')
    })

    it('filters whitespace-only strings', () => {
      expect(shouldSkip(makeString('   '))).toBe('whitespace')
      expect(shouldSkip(makeString('\t\n'))).toBe('whitespace')
    })

    it('filters pure numbers', () => {
      expect(shouldSkip(makeString('123'))).toBe('pure_number')
      expect(shouldSkip(makeString('-3.14'))).toBe('pure_number')
      // '0' is single char, caught by single_char first
      expect(shouldSkip(makeString('0'))).toBe('single_char')
      expect(shouldSkip(makeString('42'))).toBe('pure_number')
    })

    it('filters hex colors', () => {
      expect(shouldSkip(makeString('#fff'))).toBe('hex_color')
      expect(shouldSkip(makeString('#FF0000'))).toBe('hex_color')
    })

    it('filters file extension patterns', () => {
      expect(shouldSkip(makeString('logo.png'))).toBe('file_extension')
      expect(shouldSkip(makeString('styles.css'))).toBe('file_extension')
    })

    it('filters CLI flags', () => {
      expect(shouldSkip(makeString('--verbose'))).toBe('cli_flag')
    })
  })

  describe('URL/path patterns', () => {
    it('filters URLs', () => {
      expect(shouldSkip(makeString('https://example.com'))).toBe('url_path')
      expect(shouldSkip(makeString('mailto:user@test.com'))).toBe('url_path')
    })

    it('filters file paths', () => {
      expect(shouldSkip(makeString('./utils/helper'))).toBe('url_path')
      expect(shouldSkip(makeString('../config'))).toBe('url_path')
      expect(shouldSkip(makeString('/api/v1/users'))).toBe('url_path')
    })
  })

  describe('CSS patterns', () => {
    it('filters Tailwind class lists', () => {
      expect(shouldSkip(makeString('bg-blue-500 text-white p-4'))).toBe('css_class_list')
    })

    it('filters single CSS utility tokens', () => {
      expect(shouldSkip(makeString('bg-blue-500'))).toBe('css_utility_token')
    })

    it('does NOT filter normal multi-word sentences', () => {
      expect(shouldSkip(makeString('Welcome to our app'))).toBeNull()
    })
  })

  describe('SVG patterns', () => {
    it('filters SVG path data', () => {
      expect(shouldSkip(makeString('M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'))).toBe('svg_path_data')
    })

    it('filters SVG viewBox', () => {
      expect(shouldSkip(makeString('0 0 24 24'))).toBe('svg_viewbox')
    })

    it('filters SVG technical attributes by parentProperty', () => {
      // SVG path data is caught by svg_path_data regex first; use a non-path value
      expect(shouldSkip(makeString('24', 'template_attribute', { parentProperty: 'viewBox' }))).not.toBeNull()
      expect(shouldSkip(makeString('some-value', 'template_attribute', { parentProperty: 'stroke-linecap' }))).toBe('svg_technical_attr')
    })

    it('filters SVG element attributes by parent tag', () => {
      expect(shouldSkip(makeString('round', 'template_attribute', { parent: 'path' }))).toBe('svg_element_attr')
    })
  })

  describe('framework patterns', () => {
    it('filters Vue emit events', () => {
      expect(shouldSkip(makeString('update:modelValue'))).toBe('vue_emit_event')
    })

    it('filters placeholder patterns', () => {
      expect(shouldSkip(makeString('{0}'))).toBe('placeholder')
      expect(shouldSkip(makeString('...'))).toBe('placeholder')
    })

    it('filters i18n key paths', () => {
      expect(shouldSkip(makeString('common.bulk_action.item_label'))).toBe('i18n_key')
      expect(shouldSkip(makeString('status.active'))).toBe('i18n_key')
    })

    it('filters i18n function arguments', () => {
      expect(shouldSkip(makeString('messages', 'function_argument', { parent: 't' }))).toBe('i18n_function_arg')
      expect(shouldSkip(makeString('common', 'function_argument', { parent: '$t' }))).toBe('i18n_function_arg')
    })

    it('filters emit function arguments', () => {
      expect(shouldSkip(makeString('page-change', 'function_argument', { parent: 'emit' }))).toBe('emit_event_arg')
    })
  })

  describe('technical identifier detection (i18next-cli pattern)', () => {
    it('filters single lowercase words in non-text contexts', () => {
      expect(shouldSkip(makeString('messages', 'function_argument'))).toBe('technical_identifier')
      expect(shouldSkip(makeString('success', 'object_property'))).toBe('technical_identifier')
      expect(shouldSkip(makeString('danger', 'template_attribute'))).toBe('technical_identifier')
      expect(shouldSkip(makeString('round', 'template_attribute'))).toBe('technical_identifier')
    })

    it('filters kebab-case in non-text contexts', () => {
      expect(shouldSkip(makeString('out-in', 'function_argument'))).toBe('technical_identifier')
    })

    it('does NOT filter lowercase words in template_text', () => {
      expect(shouldSkip(makeString('toplam', 'template_text'))).toBeNull()
    })

    it('does NOT filter lowercase words in jsx_text', () => {
      expect(shouldSkip(makeString('welcome', 'jsx_text'))).toBeNull()
    })

    it('does NOT filter strings >= 30 chars', () => {
      expect(shouldSkip(makeString('a'.repeat(30), 'function_argument'))).toBeNull()
    })

    it('does NOT filter strings with spaces', () => {
      expect(shouldSkip(makeString('hello world', 'function_argument'))).toBeNull()
    })

    it('does NOT filter strings with uppercase', () => {
      expect(shouldSkip(makeString('Dashboard', 'function_argument'))).toBeNull()
    })
  })

  describe('error code detection', () => {
    it('filters SCREAMING_SNAKE_CASE with underscores', () => {
      expect(shouldSkip(makeString('AUTH_ERROR'))).toBe('error_code')
      expect(shouldSkip(makeString('MAX_RETRY_COUNT'))).toBe('error_code')
    })

    it('does NOT filter short uppercase without underscores', () => {
      expect(shouldSkip(makeString('OK'))).toBeNull()
      expect(shouldSkip(makeString('FAQ'))).toBeNull()
    })
  })

  describe('pass-through (content should survive)', () => {
    it('passes normal text content', () => {
      expect(shouldSkip(makeString('Welcome to our app'))).toBeNull()
      expect(shouldSkip(makeString('Submit your form'))).toBeNull()
      expect(shouldSkip(makeString('Enter your email'))).toBeNull()
    })

    it('passes capitalized words', () => {
      expect(shouldSkip(makeString('Dashboard'))).toBeNull()
      expect(shouldSkip(makeString('Settings'))).toBeNull()
    })

    it('passes Turkish content', () => {
      expect(shouldSkip(makeString('Kaydet'))).toBeNull()
      expect(shouldSkip(makeString('Hoş geldiniz'))).toBeNull()
    })

    it('passes template_text even if lowercase', () => {
      expect(shouldSkip(makeString('toplam', 'template_text'))).toBeNull()
    })

    it('passes multi-word strings in any context', () => {
      expect(shouldSkip(makeString('No data returned', 'function_argument'))).toBeNull()
    })
  })
})

// ─── calculateContentScore ───

describe('calculateContentScore', () => {
  it('gives base score of 0.5', () => {
    const score = calculateContentScore(makeString('Test'))
    expect(score).toBeCloseTo(0.5 + 0.1, 1) // +0.1 for Capitalized
  })

  it('boosts template_text context (+0.3)', () => {
    const score = calculateContentScore(makeString('toplam', 'template_text'))
    expect(score).toBeGreaterThanOrEqual(0.7)
  })

  it('boosts jsx_text context (+0.3)', () => {
    const score = calculateContentScore(makeString('Welcome', 'jsx_text'))
    expect(score).toBeGreaterThanOrEqual(0.8)
  })

  it('boosts translatable attributes (+0.2)', () => {
    const noAttr = calculateContentScore(makeString('Enter email', 'template_attribute', { parentProperty: 'data-id' }))
    const withAttr = calculateContentScore(makeString('Enter email', 'template_attribute', { parentProperty: 'placeholder' }))
    expect(withAttr).toBeGreaterThan(noAttr)
  })

  it('boosts translatable properties (+0.25)', () => {
    const score = calculateContentScore(makeString('Welcome', 'object_property', { parentProperty: 'message' }))
    expect(score).toBeGreaterThanOrEqual(0.8)
  })

  it('boosts multi-word strings', () => {
    const oneWord = calculateContentScore(makeString('Welcome'))
    const threeWords = calculateContentScore(makeString('Welcome to app'))
    expect(threeWords).toBeGreaterThan(oneWord)
  })

  it('boosts non-ASCII characters', () => {
    const ascii = calculateContentScore(makeString('Save'))
    const turkish = calculateContentScore(makeString('Hoş geldiniz'))
    expect(turkish).toBeGreaterThan(ascii)
  })

  it('penalizes camelCase strings', () => {
    const normal = calculateContentScore(makeString('Dashboard'))
    const camel = calculateContentScore(makeString('userName'))
    expect(camel).toBeLessThan(normal)
  })

  it('clamps score to [0, 1]', () => {
    // Very high: template_text + 3 words + punctuation + non-ASCII + capitalized
    const high = calculateContentScore(makeString('Lütfen giriş yapınız!', 'template_text'))
    expect(high).toBeLessThanOrEqual(1)
    expect(high).toBeGreaterThanOrEqual(0)
  })
})

// ─── applyPreFilter (integration) ───

describe('applyPreFilter', () => {
  it('combines shouldSkip + scoring + returns candidates', () => {
    const strings = [
      makeString('./component', 'import_path'),     // shouldSkip: import_path
      makeString('string', 'type_annotation'),       // shouldSkip: type_annotation
      makeString('Welcome to our app', 'jsx_text'),  // passes both
      makeString('messages', 'function_argument'),   // shouldSkip: technical_identifier
      makeString('#ff0000'),                          // shouldSkip: hex_color
      makeString('Click here', 'template_text'),     // passes both
    ]
    const result = applyPreFilter(strings)
    expect(result.candidates).toHaveLength(2)
    expect(result.skipped).toBeGreaterThanOrEqual(4)
    expect(result.candidates[0]!.value).toBe('Welcome to our app')
    expect(result.candidates[1]!.value).toBe('Click here')
  })

  it('respects minScore parameter', () => {
    const strings = [
      makeString('OK', 'other'), // low score: short, no context boost
    ]
    // With very high threshold → filtered
    const strict = applyPreFilter(strings, 0.9)
    expect(strict.candidates).toHaveLength(0)
    expect(strict.lowConfidence).toBe(1)

    // With low threshold → passes
    const lenient = applyPreFilter(strings, 0.1)
    expect(lenient.candidates).toHaveLength(1)
  })

  it('handles empty input', () => {
    const result = applyPreFilter([])
    expect(result.candidates).toHaveLength(0)
    expect(result.skipped).toBe(0)
    expect(result.lowConfidence).toBe(0)
  })

  it('reports skip reasons breakdown', () => {
    const strings = [
      makeString('./util', 'import_path'),
      makeString('./config', 'import_path'),
      makeString('#fff'),
      makeString('success', 'function_argument'),
    ]
    const result = applyPreFilter(strings)
    expect(result.skipReasons['import_path']).toBe(2)
    expect(result.skipReasons['hex_color']).toBe(1)
    expect(result.skipReasons['technical_identifier']).toBe(1)
  })
})
