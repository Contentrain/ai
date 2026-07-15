import { describe, expect, it } from 'vitest'
import { validateProject } from '../../../src/core/validator/index.js'
import type { RepoReader } from '../../../src/core/contracts/index.js'

function makeInMemoryReader(files: Record<string, string>): RepoReader {
  return {
    async readFile(path) {
      const content = files[path]
      if (content === undefined) throw new Error(`File not found: ${path}`)
      return content
    },
    async listDirectory(path) {
      const prefix = path.endsWith('/') ? path : `${path}/`
      const children = new Set<string>()
      for (const filePath of Object.keys(files)) {
        if (!filePath.startsWith(prefix)) continue
        const rest = filePath.slice(prefix.length)
        const firstSegment = rest.split('/')[0]
        if (firstSegment) children.add(firstSegment)
      }
      return [...children].toSorted()
    },
    async fileExists(path) {
      return Object.hasOwn(files, path)
    },
  }
}

const CONFIG = JSON.stringify({
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'tr', supported: ['en', 'tr'] },
  domains: ['blog'],
})

const I18N_MODEL = JSON.stringify({
  id: 'guides', name: 'Guides', kind: 'collection', domain: 'blog', i18n: true,
  fields: { title: { type: 'string' } },
})

const NON_I18N_MODEL = JSON.stringify({
  id: 'sponsors', name: 'Sponsors', kind: 'collection', domain: 'blog', i18n: false,
  fields: { name: { type: 'string' } },
})

const meta = (statuses: Record<string, string>): string =>
  JSON.stringify(Object.fromEntries(
    Object.entries(statuses).map(([id, status]) => [id, { status, source: 'agent', updated_by: 'x' }]),
  ))

const content = (ids: string[]): string =>
  JSON.stringify(Object.fromEntries(ids.map(id => [id, { title: id, name: id }])))

describe('publish-state drift notice', () => {
  it('flags drafts sitting alongside published entries in one collection', async () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/guides.json': I18N_MODEL,
      '.contentrain/content/blog/guides/tr.json': content(['aaa111bbb222', 'ccc333ddd444']),
      '.contentrain/content/blog/guides/en.json': content(['aaa111bbb222', 'ccc333ddd444']),
      '.contentrain/meta/guides/tr.json': meta({ aaa111bbb222: 'published', ccc333ddd444: 'draft' }),
      '.contentrain/meta/guides/en.json': meta({ aaa111bbb222: 'published', ccc333ddd444: 'published' }),
    })

    const result = await validateProject(reader)
    const drift = result.issues.filter(i => i.message.includes('Publish-state drift'))
    expect(drift).toHaveLength(1)
    expect(drift[0]!.severity).toBe('notice')
    expect(drift[0]!.locale).toBe('tr')
    expect(drift[0]!.message).toContain('ccc333ddd444')
    // A notice must never fail validation — publishing is a content decision.
    expect(result.valid).toBe(true)
  })

  it('stays quiet when every entry shares one status', async () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/guides.json': I18N_MODEL,
      '.contentrain/content/blog/guides/tr.json': content(['aaa111bbb222', 'ccc333ddd444']),
      '.contentrain/content/blog/guides/en.json': content(['aaa111bbb222', 'ccc333ddd444']),
      '.contentrain/meta/guides/tr.json': meta({ aaa111bbb222: 'draft', ccc333ddd444: 'draft' }),
      '.contentrain/meta/guides/en.json': meta({ aaa111bbb222: 'published', ccc333ddd444: 'published' }),
    })

    const result = await validateProject(reader)
    expect(result.issues.filter(i => i.message.includes('Publish-state drift'))).toHaveLength(0)
  })
})

describe('non-i18n meta layout mismatch', () => {
  it('flags a stray meta file at a non-default locale', async () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/sponsors.json': NON_I18N_MODEL,
      '.contentrain/content/blog/sponsors/data.json': content(['aaa111bbb222']),
      '.contentrain/meta/sponsors/tr.json': meta({ aaa111bbb222: 'published' }),
      // Left behind by a write that derived the meta path from the caller's locale.
      '.contentrain/meta/sponsors/en.json': meta({ aaa111bbb222: 'draft' }),
    })

    const result = await validateProject(reader)
    const mismatch = result.issues.filter(i => i.message.includes('Meta layout mismatch'))
    expect(mismatch).toHaveLength(1)
    expect(mismatch[0]!.severity).toBe('warning')
    expect(mismatch[0]!.message).toContain('en.json')
    expect(mismatch[0]!.message).toContain('tr.json')
  })

  it('stays quiet when a non-i18n model has only its default-locale meta', async () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/sponsors.json': NON_I18N_MODEL,
      '.contentrain/content/blog/sponsors/data.json': content(['aaa111bbb222']),
      '.contentrain/meta/sponsors/tr.json': meta({ aaa111bbb222: 'published' }),
    })

    const result = await validateProject(reader)
    expect(result.issues.filter(i => i.message.includes('Meta layout mismatch'))).toHaveLength(0)
  })

  it('stays quiet for an i18n model with per-locale meta', async () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/guides.json': I18N_MODEL,
      '.contentrain/content/blog/guides/tr.json': content(['aaa111bbb222']),
      '.contentrain/content/blog/guides/en.json': content(['aaa111bbb222']),
      '.contentrain/meta/guides/tr.json': meta({ aaa111bbb222: 'published' }),
      '.contentrain/meta/guides/en.json': meta({ aaa111bbb222: 'published' }),
    })

    const result = await validateProject(reader)
    expect(result.issues.filter(i => i.message.includes('Meta layout mismatch'))).toHaveLength(0)
  })
})
