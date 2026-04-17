import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalReader } from '../../../src/providers/local/reader.js'

/**
 * LocalReader exercises the filesystem directly, so the tests materialise
 * real files under `mkdtemp` rather than mocking node:fs. That keeps the
 * suite honest about encoding, empty-dir semantics, and missing-path
 * handling while staying fast.
 */

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'cr-local-reader-'))
})

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true })
})

describe('LocalReader.readFile', () => {
  it('reads a relative path as UTF-8', async () => {
    await mkdir(join(tmpRoot, '.contentrain'), { recursive: true })
    await writeFile(join(tmpRoot, '.contentrain/config.json'), '{"a":1}\n')
    const reader = new LocalReader(tmpRoot)

    const content = await reader.readFile('.contentrain/config.json')
    expect(content).toBe('{"a":1}\n')
  })

  it('also accepts absolute paths via node:path/resolve', async () => {
    const abs = join(tmpRoot, 'abs.txt')
    await writeFile(abs, 'hello\n')
    const reader = new LocalReader(tmpRoot)

    expect(await reader.readFile(abs)).toBe('hello\n')
  })

  it('throws when the file is missing — explicit tolerance required', async () => {
    const reader = new LocalReader(tmpRoot)
    await expect(reader.readFile('missing.json')).rejects.toThrow()
  })

  it('ignores the ref parameter (local worktree is the only revision)', async () => {
    await writeFile(join(tmpRoot, 'a.txt'), 'A\n')
    const reader = new LocalReader(tmpRoot)
    // Same content regardless of ref.
    expect(await reader.readFile('a.txt', 'contentrain')).toBe('A\n')
    expect(await reader.readFile('a.txt', 'main')).toBe('A\n')
  })
})

describe('LocalReader.listDirectory', () => {
  it('returns entry names for an existing directory', async () => {
    await mkdir(join(tmpRoot, 'dir'), { recursive: true })
    await writeFile(join(tmpRoot, 'dir/a.json'), '{}')
    await writeFile(join(tmpRoot, 'dir/b.md'), '# b')
    const reader = new LocalReader(tmpRoot)

    const names = await reader.listDirectory('dir')
    expect(names.toSorted()).toEqual(['a.json', 'b.md'])
  })

  it('returns [] for a missing directory', async () => {
    const reader = new LocalReader(tmpRoot)
    expect(await reader.listDirectory('nonexistent')).toEqual([])
  })

  it('returns [] when the path is a file, not a directory', async () => {
    await writeFile(join(tmpRoot, 'f.txt'), 'x')
    const reader = new LocalReader(tmpRoot)
    expect(await reader.listDirectory('f.txt')).toEqual([])
  })
})

describe('LocalReader.fileExists', () => {
  it('returns true for an existing file', async () => {
    await writeFile(join(tmpRoot, 'x.json'), '{}')
    const reader = new LocalReader(tmpRoot)
    expect(await reader.fileExists('x.json')).toBe(true)
  })

  it('returns true for an existing directory', async () => {
    await mkdir(join(tmpRoot, 'subdir'), { recursive: true })
    const reader = new LocalReader(tmpRoot)
    expect(await reader.fileExists('subdir')).toBe(true)
  })

  it('returns false for a missing path', async () => {
    const reader = new LocalReader(tmpRoot)
    expect(await reader.fileExists('nope')).toBe(false)
  })

  it('returns true for a nested directory that exists', async () => {
    await mkdir(join(tmpRoot, '.contentrain/content/blog/m'), { recursive: true })
    const reader = new LocalReader(tmpRoot)
    expect(await reader.fileExists('.contentrain/content/blog/m')).toBe(true)
  })
})
