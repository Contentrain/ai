import { describe, expect, it } from 'vitest'
import { planVocabularyDelete, planVocabularySave } from '../../../src/core/ops/vocabulary-save.js'
import type { RepoReader } from '../../../src/core/contracts/index.js'

/**
 * The vocabulary was the one part of `.contentrain/` with no write tool, while
 * the rules forbid editing that directory by hand — so the only way to add a
 * canonical term was to break the rule, which a field report duly did.
 *
 * Its shape is `term -> locale -> translation`, and it reads identically the
 * other way round. The same report built it locale-first and MCP accepted it,
 * because nothing checked. A vocabulary inverted that way is structurally
 * valid and matches nothing.
 */

const PATH = '.contentrain/vocabulary.json'

function readerWith(vocabulary?: unknown): RepoReader {
  const files: Record<string, string> = vocabulary === undefined
    ? {}
    : { [PATH]: JSON.stringify(vocabulary) }
  return {
    readFile: (p: string) => p in files
      ? Promise.resolve(files[p]!)
      : Promise.reject(new Error(`ENOENT ${p}`)),
    listDirectory: () => Promise.resolve([]),
    fileExists: (p: string) => Promise.resolve(p in files),
  }
}

const written = (changes: Array<{ path: string; content: string | null }>) =>
  JSON.parse(changes.find(c => c.path === PATH)!.content!) as { version: number; terms: Record<string, Record<string, string>> }

describe('planVocabularySave', () => {
  it('creates the file when there is none', async () => {
    const plan = await planVocabularySave(readerWith(), {
      terms: { 'sign-in': { en: 'Sign in', tr: 'Giriş yap' } },
    })

    expect(written(plan.changes)).toEqual({
      version: 1,
      terms: { 'sign-in': { en: 'Sign in', tr: 'Giriş yap' } },
    })
    expect(plan.result).toMatchObject({ added: ['sign-in'], updated: [], total: 1 })
  })

  it('merges rather than replacing', async () => {
    const plan = await planVocabularySave(
      readerWith({ version: 1, terms: { 'sign-in': { en: 'Sign in' }, 'log-out': { en: 'Log out' } } }),
      { terms: { 'add-to-cart': { en: 'Add to cart' } } },
    )

    expect(Object.keys(written(plan.changes).terms).toSorted()).toEqual(['add-to-cart', 'log-out', 'sign-in'])
    expect(plan.result).toMatchObject({ added: ['add-to-cart'], updated: [] })
  })

  it('adds a locale to an existing term without dropping the others', async () => {
    const plan = await planVocabularySave(
      readerWith({ version: 1, terms: { 'sign-in': { en: 'Sign in' } } }),
      { terms: { 'sign-in': { tr: 'Giriş yap' } } },
    )

    expect(written(plan.changes).terms['sign-in']).toEqual({ en: 'Sign in', tr: 'Giriş yap' })
    expect(plan.result).toMatchObject({ added: [], updated: ['sign-in'] })
  })

  it('reports a replaced translation with the value it replaced', async () => {
    const plan = await planVocabularySave(
      readerWith({ version: 1, terms: { 'sign-in': { en: 'Log in' } } }),
      { terms: { 'sign-in': { en: 'Sign in' } } },
    )

    expect(plan.advisories.some(a => a.includes('en: "Log in" → "Sign in"'))).toBe(true)
  })

  it('reports two terms that share a translation', async () => {
    const plan = await planVocabularySave(
      readerWith({ version: 1, terms: { 'sign-in': { en: 'Sign in' } } }),
      { terms: { login: { en: 'Sign in' } } },
    )

    expect(plan.advisories.some(a => a.includes('share the translation "Sign in"'))).toBe(true)
  })

  it('preserves the file version', async () => {
    const plan = await planVocabularySave(
      readerWith({ version: 2, terms: {} }),
      { terms: { 'sign-in': { en: 'Sign in' } } },
    )
    expect(written(plan.changes).version).toBe(2)
  })

  describe('rejects the inversion that silently produces a useless vocabulary', () => {
    it('refuses locale-first nesting', async () => {
      await expect(planVocabularySave(readerWith(), {
        terms: { en: { 'sign-in': 'Sign in' }, tr: { 'sign-in': 'Giriş yap' } },
      })).rejects.toThrow(/is not a locale code/)
    })

    it('names the shape it wanted', async () => {
      await expect(planVocabularySave(readerWith(), {
        terms: { en: { 'sign-in': 'Sign in' } },
      })).rejects.toThrow(/one term, its translations inside/)
    })
  })

  describe('other shape errors', () => {
    it('refuses a term slug that is not kebab-case', async () => {
      await expect(planVocabularySave(readerWith(), {
        terms: { Sign_In: { en: 'Sign in' } },
      })).rejects.toThrow(/must be kebab-case/)
    })

    it('refuses a term with no translations', async () => {
      await expect(planVocabularySave(readerWith(), {
        terms: { 'sign-in': {} },
      })).rejects.toThrow(/has no translations/)
    })

    it('accepts a region-qualified locale', async () => {
      const plan = await planVocabularySave(readerWith(), {
        terms: { 'sign-in': { 'en': 'Sign in', 'pt-BR': 'Entrar' } },
      })
      expect(written(plan.changes).terms['sign-in']).toHaveProperty('pt-BR')
    })
  })
})

describe('planVocabularyDelete', () => {
  const seeded = () => readerWith({
    version: 1,
    terms: { 'sign-in': { en: 'Sign in' }, 'log-out': { en: 'Log out' } },
  })

  it('removes the named terms and keeps the rest', async () => {
    const plan = await planVocabularyDelete(seeded(), { terms: ['sign-in'] })

    expect(written(plan.changes).terms).toEqual({ 'log-out': { en: 'Log out' } })
    expect(plan.result).toMatchObject({ deleted: ['sign-in'], missing: [], total: 1 })
  })

  it('reports an unknown slug instead of failing', async () => {
    const plan = await planVocabularyDelete(seeded(), { terms: ['sign-in', 'nope'] })

    expect(plan.result).toMatchObject({ deleted: ['sign-in'], missing: ['nope'] })
    expect(plan.advisories.some(a => a.includes('nothing to delete'))).toBe(true)
  })

  // An empty change list lets the tool skip the commit rather than open a
  // branch for a no-op.
  it('emits no change when nothing matched', async () => {
    const plan = await planVocabularyDelete(seeded(), { terms: ['nope'] })

    expect(plan.changes).toEqual([])
    expect(plan.result).toMatchObject({ deleted: [], missing: ['nope'], total: 2 })
  })
})
