import { describe, expect, it } from 'vitest'
import { frontmatterCommentKeys, parseFrontmatterScalar, parseMarkdownFrontmatter, stripFrontmatterComment } from './index'

// #512: a ` # comment` after a value is a YAML comment, not part of the value.
describe('inline frontmatter comments', () => {
  it.each([
    ['draft # todo', 'draft'],
    ['"A" # x', '"A"'],
    ["'it''s' # x", "'it''s'"],
    ['[a, b] # x', '[a, b]'],
    ['[a, b] # see [c]', '[a, b]'],
    ['["x]", b] # c', '["x]", b]'],
    ['[[a], b] # c', '[[a], b]'],
    ['42 # answer', '42'],
    ['plain', 'plain'],
    ['C#', 'C#'],
    ['"a # b"', '"a # b"'],
    ["'a # b'", "'a # b'"],
    ['"esc \\" # q" # x', '"esc \\" # q"'],
    ['#fff', '#fff'],
    ['a#b', 'a#b'],
  ])('%s → %s', (raw, expected) => {
    expect(stripFrontmatterComment(raw)).toBe(expected)
  })

  it('reads the value without the comment, quotes resolved', () => {
    expect(parseMarkdownFrontmatter('---\ntags: [a, b] # see [c]\n---\n').frontmatter).toEqual({ tags: ['a', 'b'] })
    const { frontmatter } = parseMarkdownFrontmatter('---\nstatus: draft # todo\ntitle: "A" # x\ncount: 3 # n\ntags: [a, b] # t\nlist:\n  - x # c\n  - "y" # d\ncolor: "#fff"\nlang: C#\n---\n\nB\n')
    expect(frontmatter).toEqual({ status: 'draft', title: 'A', count: 3, tags: ['a', 'b'], list: ['x', 'y'], color: '#fff', lang: 'C#' })
  })

  it('keeps a quoted # and a value that starts with #', () => {
    expect(parseFrontmatterScalar('"a # b"')).toBe('a # b')
    expect(parseFrontmatterScalar('#fff')).toBe('#fff')
  })

  it('names the keys whose line carries a comment', () => {
    expect(frontmatterCommentKeys('---\nstatus: draft # todo\ntitle: "C # x"\nlang: C#\n# own line\n---\n\nB # not frontmatter\n')).toEqual(['status'])
    expect(frontmatterCommentKeys('no frontmatter # here')).toEqual([])
    expect(frontmatterCommentKeys('---\ntags:\n  - a # c\n  - b # d\nlist:\n  - plain\n---\n')).toEqual(['tags'])
    expect(frontmatterCommentKeys('---\n# a comment line\n- stray # x\n---\n')).toEqual([])
  })
})
