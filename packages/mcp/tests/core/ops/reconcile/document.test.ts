import { describe, expect, it } from 'vitest'
import { parseMarkdownFrontmatter } from '@contentrain/types'
import type { Files } from './helpers.js'
import { CONFIG, contentChanges, reconcile } from './helpers.js'

const DOC_MODEL = JSON.stringify({
  id: 'guide',
  name: 'Guide',
  kind: 'document',
  domain: 'site',
  i18n: true,
  title_field: 'title',
  fields: { title: { type: 'text', required: true } },
})
const DOC_EN = '.contentrain/content/site/guide/getting-started/en.json'.replace('.json', '.md')

function docProject(files: Files): Files {
  return {
    '.contentrain/config.json': CONFIG,
    '.contentrain/models/guide.json': DOC_MODEL,
    ...files,
  }
}

const BASE_DOC = '---\ntitle: Getting Started\norder: 1\n---\n\nOriginal body.\n'

describe('planReconcile — documents', () => {
  const BASE = docProject({ [DOC_EN]: BASE_DOC })

  it('frontmatter keys split across sides plus a single-side body edit merge cleanly', async () => {
    const ours = docProject({ [DOC_EN]: '---\ntitle: Getting Started Fast\norder: 1\n---\n\nOriginal body.\n' })
    const theirs = docProject({ [DOC_EN]: '---\ntitle: Getting Started\norder: 2\n---\n\nRewritten body.\n' })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toEqual([])
    const merged = contentChanges(plan).find(c => c.path === DOC_EN)!.content!
    const { frontmatter, body } = parseMarkdownFrontmatter(merged)
    expect(frontmatter['title']).toBe('Getting Started Fast')
    expect(frontmatter['order']).toBe(2)
    expect(body.trim()).toBe('Rewritten body.')
  })

  it('a body edited on both sides is a document_body_conflict — never text-merged', async () => {
    const ours = docProject({ [DOC_EN]: '---\ntitle: Getting Started\norder: 1\n---\n\nOurs body.\n' })
    const theirs = docProject({ [DOC_EN]: '---\ntitle: Getting Started\norder: 1\n---\n\nTheirs body.\n' })
    const plan = await reconcile({ base: BASE, ours, theirs })
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.code).toBe('document_body_conflict')
    expect(plan.conflicts[0]!.key).toBe('getting-started')
    // Ours preserved while unresolved.
    expect(contentChanges(plan).find(c => c.path === DOC_EN)).toBeUndefined()
  })

  it('a document deleted on one side and edited on the other is a delete_edit conflict', async () => {
    const ours = docProject({})
    const theirs = docProject({ [DOC_EN]: '---\ntitle: Getting Started (rev)\norder: 1\n---\n\nOriginal body.\n' })
    const plan = await reconcile({ base: BASE, ours, theirs })
    const conflict = plan.conflicts.find(c => c.code === 'delete_edit_conflict')
    expect(conflict).toBeDefined()
    expect(conflict!.kind).toBe('document')
    expect(conflict!.key).toBe('getting-started')
  })
})
