import { describe, expect, it } from 'vitest'
import { parseMarkdownFrontmatter, preservedKeyConflicts, serializeMarkdownFrontmatter } from './index'

const save = (raw: string, patch: Record<string, unknown> = {}) => {
  const doc = parseMarkdownFrontmatter(raw)
  return serializeMarkdownFrontmatter({ ...doc.frontmatter, ...patch }, doc.body, doc.preserved)
}

describe('frontmatter round-trip keeps what it cannot read', () => {
  it.each([
    ['a Turkish key', '---\ntitle: A\nyazar adı: Ayşe\nslug: a\n---\n\nBody\n'],
    ['a key with a space', '---\ntitle: A\nfirst name: Ada\n---\n\nBody\n'],
    ['a nested map', '---\ntitle: A\nseo:\n  title: T\n  noindex: true\nslug: a\n---\n\nBody\n'],
    ['a comment line', '---\n# keep me\ntitle: A\n# and me\nslug: a\n---\n\nBody\n'],
    ['CRLF', '---\r\ntitle: A\r\nyazar adı: Ayşe\r\n---\r\n\r\nBody\r\n'],
  ])('%s comes back byte-identical', (_name, raw) => {
    expect(save(raw)).toBe(raw)
  })

  it('does not read the key above a nested map as an empty array', () => {
    const doc = parseMarkdownFrontmatter('---\ntitle: A\nseo:\n  title: T\n---\n\nB\n')
    expect(doc.frontmatter).toEqual({ title: 'A' })
    expect(doc.preserved?.blocks[0]).toMatchObject({ key: 'seo', after: 'title' })
  })

  it('lets a new value win over a preserved block with the same key, written once', () => {
    const raw = '---\ntitle: A\nseo:\n  title: T\n---\n\nB\n'
    const doc = parseMarkdownFrontmatter(raw)
    expect(preservedKeyConflicts({ title: 'A', seo: { title: 'N' } }, doc.preserved)).toEqual(['seo'])
    const out = save(raw, { seo: { title: 'N' } })
    expect(out.match(/^seo:/gm)).toHaveLength(1)
    expect(out).toContain('title: N')
    expect(out).not.toContain('title: T')
  })

  it('falls back to the previous surviving field when the anchor is deleted', () => {
    const raw = '---\na: 1\nb: 2\nüçüncü alan: x\nc: 3\n---\n\nB\n'
    const doc = parseMarkdownFrontmatter(raw)
    const { b: _b, ...rest } = doc.frontmatter
    const out = serializeMarkdownFrontmatter(rest, doc.body, doc.preserved)
    expect(out).toBe('---\na: 1\nüçüncü alan: x\nc: 3\n---\n\nB\n')
    const { a: _a, b: _b2, ...rest2 } = doc.frontmatter
    expect(serializeMarkdownFrontmatter(rest2, doc.body, doc.preserved)).toContain('üçüncü alan: x')
  })

  it.each([
    ['frontmatter with no trailing newline', '---\ntitle: A\nyazar adı: Ayşe\n---'],
    ['a body with no trailing newline', '---\ntitle: A\nyazar adı: Ayşe\n---\n\nBody'],
    ['CRLF with no trailing newline', '---\r\ntitle: A\r\nyazar adı: Ayşe\r\n---\r\n\r\nBody'],
  ])('%s comes back byte-identical', (_name, raw) => {
    expect(save(raw)).toBe(raw)
  })

  it('leaves documents with nothing unreadable untouched in shape', () => {
    expect(parseMarkdownFrontmatter('---\ntitle: A\ntags:\n  - x\n---\n\nB\n').preserved).toBeUndefined()
  })
})
