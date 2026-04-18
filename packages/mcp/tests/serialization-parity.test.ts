import { describe, expect, it } from 'vitest'
import { canonicalStringify } from '../src/core/serialization/index.js'

/**
 * Byte-parity fixture suite for `canonicalStringify`.
 *
 * Each fixture hardcodes the byte-exact expected output. Any change to
 * key ordering, indent, trailing newline, null filtering, or unicode handling
 * surfaces here as a failed assertion.
 *
 * See `.internal/refactor/03-conformance-contract.md` §2 for the serialization
 * contract these fixtures defend.
 */

interface Fixture {
  name: string
  input: unknown
  fieldOrder?: string[]
  expected: string
}

const fixtures: Fixture[] = [
  {
    name: 'empty-object',
    input: {},
    expected: '{}\n',
  },
  {
    name: 'empty-array',
    input: [],
    expected: '[]\n',
  },
  {
    name: 'single-string-field',
    input: { name: 'Test' },
    expected: `{
  "name": "Test"
}
`,
  },
  {
    name: 'alphabetic-sort',
    input: { z: 1, a: 2, m: 3 },
    expected: `{
  "a": 2,
  "m": 3,
  "z": 1
}
`,
  },
  {
    name: 'nested-sort-recursive',
    input: { outer: { z: 1, a: 2 }, another: 'x' },
    expected: `{
  "another": "x",
  "outer": {
    "a": 2,
    "z": 1
  }
}
`,
  },
  {
    name: 'null-values-filtered',
    input: { a: null, b: 'kept' },
    expected: `{
  "b": "kept"
}
`,
  },
  {
    name: 'undefined-values-filtered',
    input: { keep: 1, drop: undefined },
    expected: `{
  "keep": 1
}
`,
  },
  {
    name: 'unicode-turkish',
    input: { greeting: 'Merhaba dünya şğüöçıİ' },
    expected: `{
  "greeting": "Merhaba dünya şğüöçıİ"
}
`,
  },
  {
    name: 'unicode-emoji',
    input: { icon: '🎉✨💯' },
    expected: `{
  "icon": "🎉✨💯"
}
`,
  },
  {
    name: 'unicode-cjk',
    input: { text: '你好世界' },
    expected: `{
  "text": "你好世界"
}
`,
  },
  {
    name: 'nested-deep',
    input: { a: { b: { c: { d: 'deep' } } } },
    expected: `{
  "a": {
    "b": {
      "c": {
        "d": "deep"
      }
    }
  }
}
`,
  },
  {
    name: 'array-order-preserved',
    input: { arr: ['c', 'a', 'b'] },
    expected: `{
  "arr": [
    "c",
    "a",
    "b"
  ]
}
`,
  },
  {
    name: 'array-of-objects-keys-sorted',
    input: { items: [{ z: 1 }, { a: 2 }] },
    expected: `{
  "items": [
    {
      "z": 1
    },
    {
      "a": 2
    }
  ]
}
`,
  },
  {
    name: 'field-order-override',
    input: { z: 1, a: 2, m: 3 },
    fieldOrder: ['z'],
    expected: `{
  "z": 1,
  "a": 2,
  "m": 3
}
`,
  },
  {
    name: 'escape-tab-and-newline',
    input: { s: 'tab\there\nnewline' },
    expected: `{
  "s": "tab\\there\\nnewline"
}
`,
  },
  {
    name: 'escape-quote',
    input: { s: 'he said "hi"' },
    expected: `{
  "s": "he said \\"hi\\""
}
`,
  },
  {
    name: 'number-types',
    input: { i: 42, f: 3.14, z: 0, neg: -1 },
    expected: `{
  "f": 3.14,
  "i": 42,
  "neg": -1,
  "z": 0
}
`,
  },
  {
    name: 'boolean-values',
    input: { t: true, f: false },
    expected: `{
  "f": false,
  "t": true
}
`,
  },
  {
    name: 'collection-object-map-sorted',
    input: { xyz789abcdef: { n: 3 }, abc123def456: { n: 1 }, mid456ghi789: { n: 2 } },
    expected: `{
  "abc123def456": {
    "n": 1
  },
  "mid456ghi789": {
    "n": 2
  },
  "xyz789abcdef": {
    "n": 3
  }
}
`,
  },
  {
    name: 'mixed-types-sorted',
    input: { str: 'text', num: 1, bool: true, arr: [1, 2], obj: { x: 1 } },
    expected: `{
  "arr": [
    1,
    2
  ],
  "bool": true,
  "num": 1,
  "obj": {
    "x": 1
  },
  "str": "text"
}
`,
  },
]

describe('serialization byte-parity — canonicalStringify', () => {
  it.each(fixtures)('$name', ({ input, fieldOrder, expected }) => {
    const actual = canonicalStringify(input, fieldOrder)
    expect(actual).toBe(expected)
    // Explicit byte-length assertion catches invisible unicode drift
    expect(Buffer.byteLength(actual, 'utf-8')).toBe(Buffer.byteLength(expected, 'utf-8'))
  })

  it('trailing newline is always present', () => {
    for (const { input, fieldOrder } of fixtures) {
      expect(canonicalStringify(input, fieldOrder).endsWith('\n')).toBe(true)
    }
  })

  it('indent is 2 spaces', () => {
    const output = canonicalStringify({ a: { b: 1 } })
    expect(output).toContain('\n  "a":')
    expect(output).toContain('\n    "b":')
    expect(output).not.toContain('\t')
  })
})
