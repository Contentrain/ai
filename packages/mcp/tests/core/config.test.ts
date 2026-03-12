import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { readConfig, readVocabulary } from '../../src/core/config.js'

const FIXTURE = join(import.meta.dirname, '..', 'fixtures')

describe('readConfig', () => {
  it('reads config from fixture', async () => {
    const config = await readConfig(FIXTURE)
    expect(config).not.toBeNull()
    expect(config!.stack).toBe('nuxt')
    expect(config!.workflow).toBe('review')
    expect(config!.locales.default).toBe('en')
    expect(config!.locales.supported).toEqual(['en', 'tr'])
    expect(config!.domains).toEqual(['marketing', 'blog', 'system'])
  })

  it('returns null for missing config', async () => {
    const config = await readConfig('/nonexistent')
    expect(config).toBeNull()
  })
})

describe('readVocabulary', () => {
  it('reads vocabulary from fixture', async () => {
    const vocab = await readVocabulary(FIXTURE)
    expect(vocab).not.toBeNull()
    expect(vocab!.version).toBe(1)
    expect(Object.keys(vocab!.terms)).toHaveLength(2)
    expect(vocab!.terms['read-more']!['en']).toBe('Read More')
  })
})
