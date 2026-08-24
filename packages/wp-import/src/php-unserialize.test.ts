import { describe, it, expect } from 'vitest'
import { looksSerialized, phpUnserialize, tryUnserialize } from './index'

describe('phpUnserialize', () => {
  it('decodes scalars', () => {
    expect(phpUnserialize('i:42;')).toBe(42)
    expect(phpUnserialize('d:1.5;')).toBe(1.5)
    expect(phpUnserialize('b:1;')).toBe(true)
    expect(phpUnserialize('N;')).toBeNull()
    expect(phpUnserialize('s:5:"hello";')).toBe('hello')
  })

  it('string lengths are bytes, not code points', () => {
    // "türk" is 5 UTF-8 bytes (ü is two)
    expect(phpUnserialize('s:5:"türk";')).toBe('türk')
  })

  it('arrays become lists when keys are consecutive integers, objects otherwise', () => {
    expect(phpUnserialize('a:2:{i:0;s:1:"a";i:1;s:1:"b";}')).toEqual(['a', 'b'])
    expect(phpUnserialize('a:1:{s:3:"key";i:7;}')).toEqual({ key: 7 })
  })

  it('objects keep their class name', () => {
    expect(phpUnserialize('O:3:"Foo":1:{s:1:"x";i:1;}')).toEqual({ __class: 'Foo', x: 1 })
  })

  it('tryUnserialize falls back to the original value on damage', () => {
    const r = tryUnserialize('a:2:{s:5:"small";i:1;')
    expect(r.ok).toBe(false)
    expect(r.serialized).toBe(true)
    expect(r.value).toBe('a:2:{s:5:"small";i:1;')
  })

  it('looksSerialized rejects plain strings', () => {
    expect(looksSerialized('hello world')).toBe(false)
    expect(looksSerialized('a:1:{s:1:"k";i:1;}')).toBe(true)
  })
})
