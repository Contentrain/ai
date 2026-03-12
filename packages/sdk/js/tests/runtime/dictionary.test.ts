import { describe, it, expect } from 'vitest'
import { DictionaryAccessor } from '../../src/runtime/dictionary.js'

function createAccessor() {
  const data = new Map<string, Record<string, string>>()
  data.set('en', { not_found: 'Page not found', server_error: 'Server error' })
  data.set('tr', { not_found: 'Sayfa bulunamadı', server_error: 'Sunucu hatası' })
  return new DictionaryAccessor(data)
}

describe('DictionaryAccessor', () => {
  it('returns all keys for a locale', () => {
    const result = createAccessor().locale('en').get()
    expect(result).toEqual({ not_found: 'Page not found', server_error: 'Server error' })
  })

  it('returns single key value', () => {
    const result = createAccessor().locale('tr').get('not_found')
    expect(result).toBe('Sayfa bulunamadı')
  })

  it('returns undefined for missing key', () => {
    const result = createAccessor().locale('en').get('nonexistent')
    expect(result).toBeUndefined()
  })

  it('returns empty object for unknown locale', () => {
    const result = createAccessor().locale('fr').get()
    expect(result).toEqual({})
  })
})
