import { describe, expect, it } from 'vitest'
import { decide, matchesPattern, normalizePath } from '../../../src/core/migration/index.js'

/**
 * This matcher is a security control, not a convenience: it is the only thing
 * standing between a migration's write and the rest of a customer's repository.
 * So the cases below are mostly about what it must *refuse*.
 */
describe('normalizePath', () => {
  it('accepts an ordinary repository path', () => {
    expect(normalizePath('src/pages/index.astro')).toBe('src/pages/index.astro')
    expect(normalizePath('package.json')).toBe('package.json')
  })

  it.each([
    ['traversal', '../../../etc/passwd'],
    ['traversal mid-path', 'src/../../secrets'],
    ['a bare dot segment', 'src/./a.ts'],
    ['a leading dot-slash', './src/a.ts'],
    ['an absolute path', '/etc/passwd'],
    ['a backslash separator', 'src\\a.ts'],
    ['percent encoding', 'src/%2e%2e/a.ts'],
    ['an empty segment', 'src//a.ts'],
    ['an empty path', ''],
  ])('refuses %s', (_label, path) => {
    expect(normalizePath(path)).toBeUndefined()
  })

  it('refuses a NUL, which truncates a path on the other side of a syscall', () => {
    expect(normalizePath(`src/a.ts${String.fromCharCode(0)}.png`)).toBeUndefined()
    expect(normalizePath(`src/${String.fromCharCode(10)}a.ts`)).toBeUndefined()
  })

  it('refuses an absurdly long path rather than compiling a regex against it', () => {
    expect(normalizePath(`src/${'a'.repeat(5000)}.ts`)).toBeUndefined()
  })
})

describe('matchesPattern', () => {
  it('matches a literal path', () => {
    expect(matchesPattern('package.json', 'package.json')).toBe(true)
    expect(matchesPattern('package-lock.json', 'package.json')).toBe(false)
  })

  it('keeps * inside one segment', () => {
    expect(matchesPattern('src/a.ts', 'src/*')).toBe(true)
    expect(matchesPattern('src/nested/a.ts', 'src/*')).toBe(false)
    expect(matchesPattern('src/a.ts', 'src/*.ts')).toBe(true)
    expect(matchesPattern('src/a.css', 'src/*.ts')).toBe(false)
  })

  it('lets ** span segments, including none', () => {
    expect(matchesPattern('src/a.ts', 'src/**')).toBe(true)
    expect(matchesPattern('src/deep/nested/a.ts', 'src/**')).toBe(true)
    expect(matchesPattern('src/a.ts', 'src/**/a.ts')).toBe(true)
    expect(matchesPattern('src/x/y/a.ts', 'src/**/a.ts')).toBe(true)
    expect(matchesPattern('other/a.ts', 'src/**')).toBe(false)
  })

  it('is anchored at both ends, so a prefix is not a match', () => {
    expect(matchesPattern('src/a.ts', 'src')).toBe(false)
    expect(matchesPattern('not-src/a.ts', 'src/**')).toBe(false)
    expect(matchesPattern('src/a.ts.bak', 'src/*.ts')).toBe(false)
  })

  it('treats regex metacharacters in a pattern as literal text', () => {
    // Without escaping, `.` would match any character and `a+.ts` would be a
    // quantifier — an allowlist entry would silently cover more than it reads.
    expect(matchesPattern('srcXa.ts', 'src.a.ts')).toBe(false)
    expect(matchesPattern('src/a.ts', 'src/a.ts')).toBe(true)
    expect(matchesPattern('src/aaa.ts', 'src/a+.ts')).toBe(false)
    expect(matchesPattern('src/(a).ts', 'src/(a).ts')).toBe(true)
  })

  it('refuses a pattern that could not itself be a path', () => {
    expect(matchesPattern('src/a.ts', '../**')).toBe(false)
    expect(matchesPattern('src/a.ts', '/src/**')).toBe(false)
    expect(matchesPattern('src/a.ts', 'src/../**')).toBe(false)
  })
})

describe('decide', () => {
  const allow = ['src/**', 'public/**', 'package.json', 'astro.config.mjs']

  it('names the pattern that permitted a path', () => {
    expect(decide('src/pages/index.astro', allow)).toEqual({ allowed: true, pattern: 'src/**' })
    expect(decide('package.json', allow)).toEqual({ allowed: true, pattern: 'package.json' })
  })

  it('refuses anything the list does not cover, and says which kind of refusal', () => {
    expect(decide('.github/workflows/deploy.yml', allow)).toEqual({ allowed: false, reason: 'not-allowlisted' })
    expect(decide('../outside.txt', allow)).toEqual({ allowed: false, reason: 'malformed' })
  })

  it('does not treat .contentrain as implicitly writable', () => {
    // The content engine's own writes go through the content path with its own
    // invariants. A migration that also wants the store asks for it, and the
    // person approving sees that it does.
    expect(decide('.contentrain/models/blog-post.json', allow).allowed).toBe(false)
    expect(decide('.contentrain/models/blog-post.json', [...allow, '.contentrain/**']).allowed).toBe(true)
  })

  it('refuses everything when the list is empty', () => {
    expect(decide('src/a.ts', []).allowed).toBe(false)
  })
})
