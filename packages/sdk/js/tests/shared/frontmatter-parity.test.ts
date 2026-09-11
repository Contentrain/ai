import { describe, it, expect } from 'vitest'
import { parseMarkdownFrontmatter, serializeMarkdownFrontmatter } from '@contentrain/types'
import { parseFrontmatter } from '../../src/shared/frontmatter.js'

/**
 * Two readers open a `.contentrain` document: the content engine, through
 * `@contentrain/types`, and this package's generator and Astro loader. They
 * must return the same values for the same bytes — otherwise a field edited in
 * Studio and the same field in the generated client are different strings, and
 * nothing anywhere reports it.
 *
 * They did diverge. Both stripped the quotes off a quoted scalar without
 * decoding its escapes, and `"He said \"Hi\""` came back with its backslashes;
 * fixing one and not the other would have turned a shared bug into a silent
 * disagreement, which is worse. The scalar grammar now lives in one place and
 * this asserts that both callers really do reach it.
 */
describe('frontmatter parity between @contentrain/types and the SDK reader', () => {
  const documents: Record<string, string> = {
    'quotes and backslashes': [
      '---',
      'title: "He said \\"Hi\\""',
      'path: "C:\\\\Users\\\\ada"',
      '---',
      'Body.',
    ].join('\n'),

    'a value with newlines and tabs': [
      '---',
      'note: "one\\ntwo"',
      'cols: "a\\tb"',
      '---',
      'Body.',
    ].join('\n'),

    'values that look like other types': [
      '---',
      'sku: "007"',
      'version: "1.5"',
      'flag: "true"',
      'realFlag: true',
      'realCount: 42',
      'realFloat: 9.99',
      '---',
      'Body.',
    ].join('\n'),

    'lists inline and block': [
      '---',
      'inline: ["a, b", c, "d"]',
      'empty: []',
      'block:',
      '  - "a, b"',
      '  - plain',
      '---',
      'Body.',
    ].join('\n'),

    'edges': [
      '---',
      'blank: ""',
      'padded: "  spaced  "',
      'unicode: "İstanbul — café ✅"',
      'colon: "Title: subtitle"',
      'notQuoted: "a" and "b"',
      '---',
      'Body with\n\na blank line.',
    ].join('\n'),
  }

  it.each(Object.entries(documents))('agrees on %s', (_label, markdown) => {
    const canonical = parseMarkdownFrontmatter(markdown)
    const sdk = parseFrontmatter(markdown)
    expect(sdk.frontmatter).toEqual(canonical.frontmatter)
    expect(sdk.body).toEqual(canonical.body)
  })

  it('agrees on what a serialized document says, for every shape we write', () => {
    const values = {
      title: 'He said "Hi"',
      path: 'C:\\path\\to',
      note: 'line one\nline two',
      sku: '007',
      flag: 'true',
      realFlag: false,
      count: 42,
      padded: '  spaced  ',
      unicode: 'İstanbul — café ✅',
      tags: ['a, b', 'plain', ''],
      none: [],
    }
    const markdown = serializeMarkdownFrontmatter(values, 'Body.')

    const canonical = parseMarkdownFrontmatter(markdown).frontmatter
    const sdk = parseFrontmatter(markdown).frontmatter

    expect(canonical).toEqual(values)
    expect(sdk).toEqual(canonical)
  })

  /**
   * The SDK reader takes the model's declared field types into account: a
   * `string` field holding `007` must not become the number 7. That is a
   * deliberate difference from the canonical reader, which has no model — so
   * it is asserted here rather than being mistaken for drift.
   */
  it('differs only where the model says a field is string-typed', () => {
    const markdown = '---\nsku: 007\ncount: 42\n---\nBody.'

    const canonical = parseMarkdownFrontmatter(markdown).frontmatter
    expect(canonical['sku']).toBe(7)
    expect(canonical['count']).toBe(42)

    const withModel = parseFrontmatter(markdown, new Set(['sku'])).frontmatter
    expect(withModel['sku']).toBe('007')
    expect(withModel['count']).toBe(42)

    // Without the model hint the two readers agree exactly.
    expect(parseFrontmatter(markdown).frontmatter).toEqual(canonical)
  })
})
