import type { ContentrainConfig, ModelDefinition } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { planContentSave } from '../../../src/core/ops/content-save.js'
import type { RepoReader } from '../../../src/core/contracts/index.js'

/**
 * Documents used to be the only kind that replaced instead of merging. A save
 * carrying one frontmatter field wrote a file containing only that field and
 * an empty body — and reported `valid: true`, because validation runs over the
 * plan's own output, which was internally consistent and wrong.
 *
 * The field report that surfaced this measured a 495-byte page reduced to its
 * frontmatter by a single SEO-title edit, caught only because the project ran
 * the review workflow. Under auto-merge it reaches the default branch.
 */

const MODEL: ModelDefinition = {
  id: 'pages',
  name: 'Pages',
  kind: 'document',
  domain: 'marketing',
  i18n: true,
  title_field: 'title',
  fields: {
    title: { type: 'string', required: true },
    seo_title: { type: 'string' },
    author: { type: 'string', required: true },
    slug: { type: 'slug', required: true },
  },
}

const CONFIG = {
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['marketing'],
} as unknown as ContentrainConfig

const EXISTING = `---
title: Contact
seo_title: Get in touch
author: Ada
slug: iletisim
---

# Contact us

Reach the team at support@example.com. This paragraph is the body that a
frontmatter-only edit must not touch.
`

function readerOf(files: Record<string, string>): RepoReader {
  return {
    readFile: (path: string) => path in files
      ? Promise.resolve(files[path]!)
      : Promise.reject(new Error(`ENOENT ${path}`)),
    listDirectory: () => Promise.resolve([]),
    fileExists: (path: string) => Promise.resolve(path in files),
  }
}

const DOC_PATH = '.contentrain/content/marketing/pages/iletisim/en.md'
const withExisting = readerOf({ [DOC_PATH]: EXISTING })

const markdownFor = (changes: Array<{ path: string; content: string | null }>): string =>
  changes.find(c => c.path === DOC_PATH)!.content!

describe('planContentSave — document merge', () => {
  it('keeps the body when the save carries no body (the reported bug)', async () => {
    const plan = await planContentSave(withExisting, {
      model: MODEL,
      config: CONFIG,
      entries: [{ slug: 'iletisim', locale: 'en', data: { seo_title: 'Contact — Acme' } }],
    })

    const md = markdownFor(plan.changes)
    expect(md).toContain('# Contact us')
    expect(md).toContain('support@example.com')
    expect(md).toContain('frontmatter-only edit must not touch')
  })

  it('keeps frontmatter fields the save did not mention', async () => {
    const plan = await planContentSave(withExisting, {
      model: MODEL,
      config: CONFIG,
      entries: [{ slug: 'iletisim', locale: 'en', data: { seo_title: 'Contact — Acme' } }],
    })

    const md = markdownFor(plan.changes)
    expect(md).toContain('seo_title: Contact — Acme')
    expect(md).toContain('title: Contact')
    expect(md).toContain('author: Ada')
  })

  it('reports updated, not created', async () => {
    const plan = await planContentSave(withExisting, {
      model: MODEL,
      config: CONFIG,
      entries: [{ slug: 'iletisim', locale: 'en', data: { seo_title: 'x' } }],
    })
    expect(plan.result[0]).toMatchObject({ action: 'updated', slug: 'iletisim', locale: 'en' })
  })

  it('overwrites a field the save does mention', async () => {
    const plan = await planContentSave(withExisting, {
      model: MODEL,
      config: CONFIG,
      entries: [{ slug: 'iletisim', locale: 'en', data: { title: 'Contact us' } }],
    })

    const md = markdownFor(plan.changes)
    expect(md).toContain('title: Contact us')
    expect(md).not.toContain('title: Contact\n')
  })

  it('replaces the body when one is supplied', async () => {
    const plan = await planContentSave(withExisting, {
      model: MODEL,
      config: CONFIG,
      entries: [{ slug: 'iletisim', locale: 'en', data: { body: '# New body\n\nRewritten.' } }],
    })

    const md = markdownFor(plan.changes)
    expect(md).toContain('# New body')
    expect(md).not.toContain('# Contact us')
    // still a merge for frontmatter
    expect(md).toContain('author: Ada')
  })

  describe('an explicit empty body', () => {
    // Absent means "not editing the body"; present-and-empty is an instruction.
    // Honouring it keeps the contract unambiguous, and the advisory keeps it
    // from being indistinguishable from a templating mistake.
    it('is honoured, and announced', async () => {
      const plan = await planContentSave(withExisting, {
        model: MODEL,
        config: CONFIG,
        entries: [{ slug: 'iletisim', locale: 'en', data: { body: '' } }],
      })

      expect(markdownFor(plan.changes)).not.toContain('# Contact us')
      expect(plan.advisories.some(a => a.includes('body cleared'))).toBe(true)
      expect(plan.advisories.some(a => a.includes('Omit "body" to leave it untouched'))).toBe(true)
      expect(plan.result[0]!.advisories?.some(a => a.includes('body cleared'))).toBe(true)
    })

    it('says nothing when there was no body to lose', async () => {
      const bare = readerOf({ [DOC_PATH]: '---\ntitle: Contact\nauthor: Ada\nslug: iletisim\n---\n' })
      const plan = await planContentSave(bare, {
        model: MODEL,
        config: CONFIG,
        entries: [{ slug: 'iletisim', locale: 'en', data: { body: '' } }],
      })
      expect(plan.advisories.filter(a => a.includes('body cleared'))).toEqual([])
    })
  })

  describe('a new document', () => {
    it('writes exactly what it was given', async () => {
      const plan = await planContentSave(readerOf({}), {
        model: MODEL,
        config: CONFIG,
        entries: [{ slug: 'yeni', locale: 'en', data: { title: 'New', author: 'Ada', body: 'Hello.' } }],
      })

      const md = plan.changes.find(c => c.path.endsWith('yeni/en.md'))!.content!
      expect(md).toContain('title: New')
      expect(md).toContain('Hello.')
      expect(plan.result[0]).toMatchObject({ action: 'created' })
    })

    it('does not inherit another locale’s content', async () => {
      const plan = await planContentSave(withExisting, {
        model: MODEL,
        config: CONFIG,
        entries: [{ slug: 'iletisim', locale: 'tr', data: { title: 'İletişim' } }],
      })

      const md = plan.changes.find(c => c.path.endsWith('iletisim/tr.md'))!.content!
      expect(md).toContain('title: İletişim')
      expect(md).not.toContain('author: Ada')
      expect(md).not.toContain('# Contact us')
      expect(plan.result[0]).toMatchObject({ action: 'created' })
    })
  })

  // The merge has to survive the batch, not just a single entry: two saves to
  // the same document in one call must both build on the file, not race.
  it('applies two edits to the same document in one call', async () => {
    const plan = await planContentSave(withExisting, {
      model: MODEL,
      config: CONFIG,
      entries: [
        { slug: 'iletisim', locale: 'en', data: { seo_title: 'First' } },
        { slug: 'iletisim', locale: 'en', data: { title: 'Second' } },
      ],
    })

    const md = markdownFor(plan.changes)
    expect(md).toContain('title: Second')
    // the first entry's edit must survive the second — the collection branch
    // reads its accumulator before disk, and documents have to as well
    expect(md).toContain('seo_title: First')
    expect(md).toContain('author: Ada')
    expect(md).toContain('# Contact us')
  })
})
