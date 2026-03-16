import { describe, it, expect } from 'vitest'
import { DictionaryAccessor } from '../../src/runtime/dictionary.js'

function createAccessor() {
  const data = new Map<string, Record<string, string>>()
  data.set('en', {
    not_found: 'Page not found',
    server_error: 'Server error',
    'add-entry': 'Add a new entry to {model}',
    'welcome': 'Hello, {name}! You have {count} messages.',
    'no-params': 'Static text without params',
  })
  data.set('tr', {
    not_found: 'Sayfa bulunamadı',
    server_error: 'Sunucu hatası',
    'add-entry': '{model} modeline yeni kayıt ekle',
    'welcome': 'Merhaba, {name}! {count} mesajınız var.',
  })
  return new DictionaryAccessor(data)
}

describe('DictionaryAccessor', () => {
  it('returns all keys for a locale', () => {
    const result = createAccessor().locale('en').get()
    expect(result).toHaveProperty('not_found', 'Page not found')
    expect(result).toHaveProperty('server_error', 'Server error')
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

  it('interpolates params in single key', () => {
    const result = createAccessor().locale('en').get('add-entry', { model: 'blog-post' })
    expect(result).toBe('Add a new entry to blog-post')
  })

  it('interpolates multiple params', () => {
    const result = createAccessor().locale('en').get('welcome', { name: 'Ahmet', count: 5 })
    expect(result).toBe('Hello, Ahmet! You have 5 messages.')
  })

  it('interpolates with Turkish locale', () => {
    const result = createAccessor().locale('tr').get('add-entry', { model: 'blog-post' })
    expect(result).toBe('blog-post modeline yeni kayıt ekle')
  })

  it('leaves unmatched placeholders as-is', () => {
    const result = createAccessor().locale('en').get('welcome', { name: 'Ahmet' })
    expect(result).toBe('Hello, Ahmet! You have {count} messages.')
  })

  it('returns raw value when no params provided', () => {
    const result = createAccessor().locale('en').get('add-entry')
    expect(result).toBe('Add a new entry to {model}')
  })

  it('handles numeric params', () => {
    const result = createAccessor().locale('en').get('welcome', { name: 'User', count: 42 })
    expect(result).toBe('Hello, User! You have 42 messages.')
  })
})
