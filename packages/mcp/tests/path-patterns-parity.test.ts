import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import type { ModelDefinition } from '@contentrain/types'
import { PATH_PATTERNS } from '@contentrain/types'
import { resolveContentDir, resolveJsonFilePath, resolveMdFilePath } from '../src/core/content-manager.js'

/**
 * `PATH_PATTERNS` is the published description of where files live, and it is
 * not read by any code — so it can drift from the resolvers without anything
 * failing. It did: the document pattern omitted `{modelId}`, while the
 * resolvers have always put the model between the domain and the slug. A
 * plugin author following the constant would have written every document to a
 * path Contentrain does not read.
 *
 * This test fills the placeholders and compares against the resolvers, so the
 * constant can only be wrong if it is wrong on purpose.
 */

const ROOT = '/project'
const DOMAIN = 'blog'
const MODEL = 'posts'
const LOCALE = 'en'
const SLUG = 'hello-world'

const fill = (pattern: string): string =>
  join(ROOT, pattern
    .replace('{domain}', DOMAIN)
    .replace('{modelId}', MODEL)
    .replace('{locale}', LOCALE)
    .replace('{slug}', SLUG))

const model = (kind: ModelDefinition['kind'], i18n: boolean): ModelDefinition =>
  ({ id: MODEL, name: 'Posts', kind, domain: DOMAIN, i18n, title_field: 'title' })

describe('PATH_PATTERNS matches what the resolvers produce', () => {
  it('i18n JSON kinds', () => {
    for (const kind of ['singleton', 'collection', 'dictionary'] as const) {
      const m = model(kind, true)
      expect(resolveJsonFilePath(resolveContentDir(ROOT, m), m, LOCALE), kind).toBe(fill(PATH_PATTERNS.content[kind]))
    }
  })

  it('the document pattern names the model, not only the domain and slug', () => {
    const m = model('document', true)
    expect(resolveMdFilePath(resolveContentDir(ROOT, m), m, LOCALE, SLUG)).toBe(fill(PATH_PATTERNS.content.document))
    // the defect this test exists for: domain/slug with no model in between
    expect(PATH_PATTERNS.content.document).toContain('{modelId}')
  })

  it('non-i18n content drops the locale from the file name', () => {
    const json = model('collection', false)
    expect(resolveJsonFilePath(resolveContentDir(ROOT, json), json, LOCALE)).toBe(fill(PATH_PATTERNS.content.noLocale))
    const doc = model('document', false)
    expect(resolveMdFilePath(resolveContentDir(ROOT, doc), doc, LOCALE, SLUG)).toBe(fill(PATH_PATTERNS.content.noLocaleDocument))
  })

  it('content_path replaces the whole prefix the patterns describe', () => {
    const m: ModelDefinition = { ...model('collection', true), content_path: 'content/blog' }
    expect(resolveContentDir(ROOT, m)).toBe(join(ROOT, 'content/blog'))
  })

  it('every content pattern is anchored in .contentrain and names a placeholder set the resolvers can fill', () => {
    for (const [name, pattern] of Object.entries(PATH_PATTERNS.content)) {
      expect(pattern.startsWith('.contentrain/content/{domain}/{modelId}'), name).toBe(true)
    }
    for (const [name, pattern] of Object.entries(PATH_PATTERNS.meta)) {
      expect(pattern.startsWith('.contentrain/meta/{modelId}'), name).toBe(true)
      // Meta always carries a locale: a non-i18n model pins it to the default.
      expect(pattern.endsWith('{locale}.json'), name).toBe(true)
    }
  })
})
