import { describe, expect, it } from 'vitest'
import { applyPreFilter } from '../../../src/core/ast-scanner/pre-filter.js'
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

// ─── Context-based filtering ───

describe('applyPreFilter', () => {
  describe('context-based rules', () => {
    it('filters import_path context', () => {
      const strings = [makeString('./utils/helper', 'import_path')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(1)
      expect(result.filterReasons['import_path']).toBe(1)
    })

    it('filters type_annotation context', () => {
      const strings = [makeString('string', 'type_annotation')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(1)
      expect(result.filterReasons['type_annotation']).toBe(1)
    })

    it('filters css_class context', () => {
      const strings = [makeString('bg-blue-500 text-white', 'css_class')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(1)
      expect(result.filterReasons['css_class']).toBe(1)
    })

    it('filters css_utility_call context', () => {
      const strings = [
        makeString('flex items-center', 'css_utility_call'),
        makeString('rounded-lg shadow-md', 'css_utility_call'),
      ]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(2)
      expect(result.filterReasons['css_utility_call']).toBe(2)
    })

    it('filters console_call context', () => {
      const strings = [makeString('User logged in', 'console_call')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(1)
      expect(result.filterReasons['console_call']).toBe(1)
    })

    it('filters test_assertion context', () => {
      const strings = [makeString('should render correctly', 'test_assertion')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(1)
      expect(result.filterReasons['test_assertion']).toBe(1)
    })

    it('filters switch_case context', () => {
      const strings = [makeString('active', 'switch_case')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(1)
      expect(result.filterReasons['switch_case']).toBe(1)
    })
  })

  // ─── Value-based filtering ───

  describe('value-based rules', () => {
    it('filters single character strings', () => {
      const strings = [
        makeString('x'),
        makeString('a'),
        makeString('.'),
      ]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(3)
      expect(result.filterReasons['single_char']).toBe(3)
    })

    it('filters pure numbers', () => {
      const strings = [
        makeString('123'),
        makeString('0'),
        makeString('3.14'),
        makeString('100'),
      ]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(4)
      expect(result.filterReasons['pure_number']).toBe(3)
    })

    it('filters CLI flags', () => {
      const strings = [
        makeString('--verbose'),
        makeString('--output-dir'),
      ]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(2)
      expect(result.filterReasons['cli_flag']).toBe(2)
    })

    it('filters hex colors', () => {
      const strings = [
        makeString('#fff'),
        makeString('#FF0000'),
        makeString('#1a2b3c'),
        makeString('#aabbccdd'),
      ]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(4)
      expect(result.filterReasons['hex_color']).toBe(4)
    })

    it('filters file extension patterns', () => {
      const strings = [
        makeString('logo.png'),
        makeString('styles.css'),
        makeString('data.json'),
        makeString('video.mp4'),
      ]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(4)
      expect(result.filterReasons['file_extension']).toBe(4)
    })
  })

  // ─── Pass-through (conservative) ───

  describe('pass-through (when in doubt, include)', () => {
    it('passes normal text content', () => {
      const strings = [
        makeString('Welcome to our app', 'jsx_text'),
        makeString('Submit your form', 'template_text'),
        makeString('Enter your email', 'jsx_attribute'),
      ]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(3)
      expect(result.filtered).toBe(0)
    })

    it('passes multi-character strings that are not numbers', () => {
      const strings = [makeString('OK'), makeString('No')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(2)
      expect(result.filtered).toBe(0)
    })

    it('passes strings with numbers mixed with text', () => {
      const strings = [makeString('Step 1'), makeString('3 items remaining')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(2)
      expect(result.filtered).toBe(0)
    })

    it('passes variable_assignment context', () => {
      const strings = [makeString('Welcome', 'variable_assignment')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(1)
      expect(result.filtered).toBe(0)
    })

    it('passes object_property context', () => {
      const strings = [makeString('Dashboard', 'object_property')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(1)
      expect(result.filtered).toBe(0)
    })
  })

  // ─── Stats ───

  describe('stats reporting', () => {
    it('correctly reports mixed filter reasons', () => {
      const strings = [
        makeString('./component', 'import_path'),
        makeString('string', 'type_annotation'),
        makeString('bg-blue-500', 'css_class'),
        makeString('5'),
        makeString('#ff0000'),
        makeString('Welcome to our app', 'jsx_text'),
        makeString('Click here', 'template_text'),
      ]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(2)
      expect(result.filtered).toBe(5)
      expect(result.filterReasons['import_path']).toBe(1)
      expect(result.filterReasons['type_annotation']).toBe(1)
      expect(result.filterReasons['css_class']).toBe(1)
      expect(result.filterReasons['single_char']).toBe(1)
      expect(result.filterReasons['hex_color']).toBe(1)
    })

    it('returns empty filterReasons when nothing is filtered', () => {
      const strings = [makeString('Hello World', 'jsx_text')]
      const result = applyPreFilter(strings)
      expect(result.candidates).toHaveLength(1)
      expect(result.filtered).toBe(0)
      expect(Object.keys(result.filterReasons)).toHaveLength(0)
    })

    it('handles empty input', () => {
      const result = applyPreFilter([])
      expect(result.candidates).toHaveLength(0)
      expect(result.filtered).toBe(0)
      expect(Object.keys(result.filterReasons)).toHaveLength(0)
    })
  })
})
