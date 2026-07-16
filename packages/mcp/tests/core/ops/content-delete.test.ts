import { describe, expect, it } from 'vitest'
import type { ModelDefinition } from '@contentrain/types'
import { planContentDelete } from '../../../src/core/ops/content-delete.js'
import type { RepoReader } from '../../../src/core/contracts/index.js'

// The non-i18n locale guard rejects before any reader access, so a reader that
// throws on every call proves the rejection happens up front — no file is read
// or planned for removal.
const throwingReader: RepoReader = {
  async readFile() { throw new Error('reader must not be touched') },
  async listDirectory() { throw new Error('reader must not be touched') },
  async fileExists() { throw new Error('reader must not be touched') },
}

const nonI18nCollection: ModelDefinition = {
  id: 'authors',
  name: 'Authors',
  kind: 'collection',
  domain: 'blog',
  i18n: false,
  fields: { name: { type: 'string', required: true } },
}

const i18nCollection: ModelDefinition = {
  ...nonI18nCollection,
  id: 'guides',
  i18n: true,
}

describe('planContentDelete — non-i18n locale guard', () => {
  it('rejects a locale-scoped delete on a non-i18n model without touching the store', async () => {
    await expect(
      planContentDelete(throwingReader, {
        model: nonI18nCollection,
        id: 'abc123',
        locale: 'en',
        defaultLocale: 'tr',
      }),
    ).rejects.toThrow(/i18n disabled/)
  })

  it('allows a locale-free delete on a non-i18n model', async () => {
    // No locale → the guard passes and the reader IS used. An empty project
    // yields an empty plan; we only assert the guard did not fire.
    const emptyReader: RepoReader = {
      async readFile() { throw new Error('File not found') },
      async listDirectory() { return [] },
      async fileExists() { return false },
    }
    const plan = await planContentDelete(emptyReader, {
      model: nonI18nCollection,
      id: 'abc123',
      defaultLocale: 'tr',
    })
    expect(plan.result).toEqual([])
    expect(plan.changes).toEqual([])
  })

  it('still allows a locale-scoped delete on an i18n model', async () => {
    // i18n models legitimately store content per locale, so the locale must
    // pass through. An empty project yields an empty plan (no throw).
    const emptyReader: RepoReader = {
      async readFile() { throw new Error('File not found') },
      async listDirectory() { return [] },
      async fileExists() { return false },
    }
    const plan = await planContentDelete(emptyReader, {
      model: i18nCollection,
      id: 'abc123',
      locale: 'en',
      defaultLocale: 'tr',
    })
    expect(plan.result).toEqual([])
  })
})
