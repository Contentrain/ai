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

  it('leaves documents in the default shape without preserved', () => {
    expect(parseMarkdownFrontmatter('---\ntitle: A\ntags:\n  - x\n---\n\nB\n').preserved).toBeUndefined()
    expect(parseMarkdownFrontmatter('---\ntitle: A\n---\n').preserved).toBeUndefined()
  })
})

// #521: a save that changes no field is byte-identical, layout included, whether or not the frontmatter has lines the
// reader cannot parse. Exact equality only.
describe('frontmatter round-trip keeps the layout around the body', () => {
  const layouts: Array<[string, string]> = [
    ['no blank line after the closing ---', '---\ntitle: A\n---\nBody\n'],
    ['three blank lines after the closing ---', '---\ntitle: A\n---\n\n\n\nBody\n'],
    ['a double trailing newline', '---\ntitle: A\n---\n\nBody\n\n'],
    ['no final newline', '---\ntitle: A\n---\n\nBody'],
    ['no final newline and no body', '---\ntitle: A\n---'],
    ['blank lines and no body', '---\ntitle: A\n---\n\n\n'],
    ['an indented first body line', '---\ntitle: A\n---\n\n    code\n'],
    ['all of it, around a multi-paragraph body', '---\ntitle: A\nslug: a\n---\n\n\nOne\n\nTwo\n\n\n'],
  ]
  const withEol = layouts.flatMap(([name, raw]): Array<[string, string]> => [
    [`${name} (LF)`, raw],
    [`${name} (CRLF)`, raw.replace(/\n/g, '\r\n')],
    [`${name}, with an unreadable line (LF)`, raw.replace('title: A\n', 'title: A\nyazar adı: Ayşe\n')],
    [`${name}, with an unreadable line (CRLF)`, raw.replace('title: A\n', 'title: A\nyazar adı: Ayşe\n').replace(/\n/g, '\r\n')],
  ])

  it.each(withEol)('%s comes back byte-identical', (_name, raw) => {
    expect(save(raw)).toBe(raw)
  })

  it('a plain CRLF document stays CRLF', () => {
    const raw = '---\r\ntitle: A\r\n---\r\n\r\nBody\r\n'
    expect(save(raw)).toBe(raw)
    expect(save(raw, { title: 'B' })).toBe('---\r\ntitle: B\r\n---\r\n\r\nBody\r\n')
  })

  it('keeps the layout when a field changes', () => {
    expect(save('---\ntitle: A\n---\nBody\n\n', { title: 'B' })).toBe('---\ntitle: B\n---\nBody\n\n')
  })

  it('keeps the layout around a new body', () => {
    const doc = parseMarkdownFrontmatter('---\ntitle: A\n---\nOld\n\n')
    expect(serializeMarkdownFrontmatter(doc.frontmatter, 'New', doc.preserved)).toBe('---\ntitle: A\n---\nNew\n\n')
  })

  it('a cleared body leaves no blank lines behind, a first body gets the default frame', () => {
    const withBody = parseMarkdownFrontmatter('---\ntitle: A\n---\n\n\nOld\n')
    expect(serializeMarkdownFrontmatter(withBody.frontmatter, '', withBody.preserved)).toBe('---\ntitle: A\n---\n')
    const noBody = parseMarkdownFrontmatter('---\ntitle: A\n---')
    expect(serializeMarkdownFrontmatter(noBody.frontmatter, 'New', noBody.preserved)).toBe('---\ntitle: A\n---\n\nNew\n')
  })

  it('a new document keeps the default shape', () => {
    expect(serializeMarkdownFrontmatter({ title: 'A' }, 'Body')).toBe('---\ntitle: A\n---\n\nBody\n')
    expect(serializeMarkdownFrontmatter({ title: 'A' }, '')).toBe('---\ntitle: A\n---\n')
  })
})
