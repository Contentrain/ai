import { describe, expect, it } from 'vitest'
import { canonicalStringify } from '../../src/util/serializer.js'

describe('canonicalStringify', () => {
  it('sorts keys lexicographically', () => {
    const result = canonicalStringify({ z: 1, a: 2, m: 3 })
    expect(result).toBe('{\n  "a": 2,\n  "m": 3,\n  "z": 1\n}\n')
  })

  it('appends trailing newline', () => {
    const result = canonicalStringify({ a: 1 })
    expect(result.endsWith('\n')).toBe(true)
    expect(result.endsWith('\n\n')).toBe(false)
  })

  it('omits null and undefined values', () => {
    const result = canonicalStringify({ a: 1, b: null, c: undefined, d: 'ok' })
    expect(result).not.toContain('"b"')
    expect(result).not.toContain('"c"')
    expect(result).toContain('"a"')
    expect(result).toContain('"d"')
  })

  it('uses 2-space indent', () => {
    const result = canonicalStringify({ a: { b: 1 } })
    expect(result).toContain('  "a"')
    expect(result).toContain('    "b"')
  })

  it('respects fieldOrder when provided', () => {
    const result = canonicalStringify({ z: 1, a: 2, m: 3 }, ['m', 'z', 'a'])
    const keys = [...result.matchAll(/"([a-z])"/g)].map(m => m[1])
    expect(keys).toEqual(['m', 'z', 'a'])
  })

  it('sorts nested objects recursively', () => {
    const result = canonicalStringify({ b: { z: 1, a: 2 }, a: 3 })
    const parsed = JSON.parse(result)
    expect(Object.keys(parsed)).toEqual(['a', 'b'])
    expect(Object.keys(parsed['b'] as object)).toEqual(['a', 'z'])
  })

  it('preserves array order', () => {
    const result = canonicalStringify({ items: [3, 1, 2] })
    const parsed = JSON.parse(result)
    expect(parsed['items']).toEqual([3, 1, 2])
  })
})
