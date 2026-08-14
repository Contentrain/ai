import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { GitRefReader } from '../../src/git/ref-reader.js'
import { bindRef } from '../../src/core/bind-ref.js'
import { MemoryProvider } from '../../src/testing/memory-provider.js'

// One repo, two refs: `main` has v1 of a file, branch `side` has v2 plus an
// extra file. Every reader assertion runs against BOTH refs while the
// working tree stays checked out on main — the whole point of the reader.
let repoDir: string

beforeAll(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'cr-ref-reader-'))
  const git = simpleGit(repoDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')

  await mkdir(join(repoDir, '.contentrain', 'models'), { recursive: true })
  await writeFile(join(repoDir, '.contentrain', 'models', 'faq.json'), '{"v":1}\n')
  await git.add('.')
  await git.commit('v1')

  await git.checkoutLocalBranch('side')
  await writeFile(join(repoDir, '.contentrain', 'models', 'faq.json'), '{"v":2}\n')
  await writeFile(join(repoDir, '.contentrain', 'models', 'extra.json'), '{"v":2}\n')
  await git.add('.')
  await git.commit('v2')

  const mainBranch = (await git.raw(['branch', '--list'])).includes('main') ? 'main' : 'master'
  await git.checkout(mainBranch)
})

afterAll(async () => {
  await rm(repoDir, { recursive: true, force: true })
})

describe('GitRefReader', () => {
  it('reads a file at the bound ref, not the working tree', async () => {
    const side = new GitRefReader(repoDir, 'side')
    expect(await side.readFile('.contentrain/models/faq.json')).toBe('{"v":2}\n')
    // Working tree (main) still has v1 — the reader did not look at it.
    const head = new GitRefReader(repoDir, 'HEAD')
    expect(await head.readFile('.contentrain/models/faq.json')).toBe('{"v":1}\n')
  })

  it('throws for a missing file, like the contract requires', async () => {
    const head = new GitRefReader(repoDir, 'HEAD')
    await expect(head.readFile('.contentrain/models/extra.json')).rejects.toThrow()
  })

  it('lists immediate children per ref, empty for a missing directory', async () => {
    const side = new GitRefReader(repoDir, 'side')
    expect(await side.listDirectory('.contentrain/models')).toEqual(['extra.json', 'faq.json'])
    const head = new GitRefReader(repoDir, 'HEAD')
    expect(await head.listDirectory('.contentrain/models')).toEqual(['faq.json'])
    expect(await head.listDirectory('.contentrain/nope')).toEqual([])
    // Directory names (not recursive contents) at the parent level.
    expect(await head.listDirectory('.contentrain')).toEqual(['models'])
  })

  it('answers existence for files and implicit directories', async () => {
    const side = new GitRefReader(repoDir, 'side')
    expect(await side.fileExists('.contentrain/models/extra.json')).toBe(true)
    const head = new GitRefReader(repoDir, 'HEAD')
    expect(await head.fileExists('.contentrain/models/extra.json')).toBe(false)
    expect(await head.fileExists('.contentrain/models')).toBe(true)
  })
})

describe('bindRef', () => {
  it('pins every read to the given ref', async () => {
    // MemoryProvider honours the per-call ref — exactly what bindRef targets.
    const provider = new MemoryProvider({ files: { 'a.txt': 'on-contentrain' } })
    provider.seed('a.txt', 'on-side', 'side')
    const bound = bindRef(provider, 'side')
    expect(await bound.readFile('a.txt')).toBe('on-side')
    expect(await bound.fileExists('a.txt')).toBe(true)
    expect(await bound.listDirectory('')).toEqual(['a.txt'])
  })
})
