import { describe, expect, it } from 'vitest'
import { validateProject } from '../../../src/core/validator/index.js'
import type { RepoReader } from '../../../src/core/contracts/index.js'

/**
 * #512: a document file name is its slug, so validate checks it against the
 * same rule every write applies; and a ` # comment` after a frontmatter value
 * is read as a comment, which validate announces because a save drops it.
 */

function reader(files: Record<string, string>): RepoReader {
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
        const first = filePath.slice(prefix.length).split('/')[0]
        if (first) children.add(first)
      }
      return [...children].toSorted()
    },
    async fileExists(path) {
      return Object.hasOwn(files, path) || Object.keys(files).some(f => f.startsWith(`${path}/`))
    },
  }
}

const project = (docs: Record<string, string>, i18n = false) => reader({
  '.contentrain/config.json': JSON.stringify({
    version: 1, stack: 'astro', workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en'] }, domains: ['blog'],
  }),
  '.contentrain/models/posts.json': JSON.stringify({
    id: 'posts', name: 'Posts', kind: 'document', domain: 'blog', i18n, title_field: 'title',
    fields: { title: { type: 'string', required: true }, status: { type: 'string' } },
  }),
  ...Object.fromEntries(Object.entries(docs).map(([path, raw]) => [`.contentrain/content/blog/posts/${path}`, raw])),
})

describe('validate: document file names are slugs', () => {
  it('reports a file name the write tools reject, once, with the slug to rename it to', async () => {
    const result = await validateProject(project({ 'Bad_Name.md': '---\ntitle: A\n---\n\nBody\n' }))
    const slugIssues = result.issues.filter(i => i.slug === 'Bad_Name' && i.field === 'slug')
    expect(slugIssues).toHaveLength(1)
    expect(slugIssues[0]!.severity).toBe('error')
    expect(slugIssues[0]!.message).toContain('Invalid slug "Bad_Name"')
    expect(slugIssues[0]!.message).toContain('"bad-name"')
    expect(result.valid).toBe(false)
  })

  it('checks i18n (slug directory) slugs the same way', async () => {
    const result = await validateProject(project({ 'My Post/en.md': '---\ntitle: A\n---\n\nBody\n' }, true))
    expect(result.issues.some(i => i.slug === 'My Post' && i.field === 'slug' && i.message.includes('"my-post"'))).toBe(true)
  })

  it('accepts valid slugs, Turkish letters included', async () => {
    const result = await validateProject(project({ 'good-post.md': '---\ntitle: A\n---\n\nBody\n', 'çay-saati.md': '---\ntitle: B\n---\n\nBody\n' }))
    expect(result.issues.filter(i => i.field === 'slug')).toEqual([])
  })
})

describe('validate: inline YAML comments', () => {
  it('warns that a trailing comment is not part of the value and is dropped on save', async () => {
    const result = await validateProject(project({ 'a.md': '---\ntitle: "A" # x\nstatus: draft # todo\n---\n\nBody\n' }))
    const warned = result.issues.filter(i => i.severity === 'warning' && i.message.includes('comment')).map(i => i.field).toSorted()
    expect(warned).toEqual(['status', 'title'])
  })

  it('does not warn about a # that is part of the value', async () => {
    const result = await validateProject(project({ 'a.md': '---\ntitle: "C # tips"\nstatus: C#\n---\n\nBody\n' }))
    expect(result.issues.filter(i => i.message.includes('comment'))).toEqual([])
  })
})
