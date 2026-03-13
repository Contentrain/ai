import { describe, it, expect } from 'vitest'
import { SingletonAccessor } from '../../src/runtime/singleton.js'

interface Hero {
  title: string
  subtitle: string
  cta_text: string
}

function createAccessor() {
  const data = new Map<string, Hero>()
  data.set('en', { title: 'Welcome', subtitle: 'Start here', cta_text: 'Go' })
  data.set('tr', { title: 'Hoş Geldiniz', subtitle: 'Buradan başlayın', cta_text: 'Git' })
  return new SingletonAccessor(data)
}

describe('SingletonAccessor', () => {
  it('returns data for specified locale', () => {
    const result = createAccessor().locale('en').get()
    expect(result.title).toBe('Welcome')
  })

  it('returns data for different locale', () => {
    const result = createAccessor().locale('tr').get()
    expect(result.title).toBe('Hoş Geldiniz')
  })

  it('returns first available locale when none specified', () => {
    const result = createAccessor().get()
    expect(result.title).toBeDefined()
  })

  it('throws for unknown locale', () => {
    expect(() => createAccessor().locale('fr').get()).toThrow()
  })

  it('exposes include() for relation-bearing singleton models', () => {
    const accessor = createAccessor() as unknown as { include?: (...fields: string[]) => unknown }
    expect(typeof accessor.include).toBe('function')
  })
})
