import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { simpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { LocalProvider } from '../../../src/providers/local/provider.js'

async function writeFileSafe(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-local-branch-ops-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@contentrain.io')
  await writeFileSafe(join(testDir, 'README.md'), 'base\n')
  await git.add('.')
  await git.commit('initial')
  await git.branch([CONTENTRAIN_BRANCH])
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('LocalProvider — RepoProvider surface', () => {
  it('exposes branch-ops methods (contract check)', () => {
    const provider = new LocalProvider(testDir)
    expect(typeof provider.listBranches).toBe('function')
    expect(typeof provider.createBranch).toBe('function')
    expect(typeof provider.deleteBranch).toBe('function')
    expect(typeof provider.getBranchDiff).toBe('function')
    expect(typeof provider.mergeBranch).toBe('function')
    expect(typeof provider.isMerged).toBe('function')
    expect(typeof provider.getDefaultBranch).toBe('function')
    expect(provider.capabilities.localWorktree).toBe(true)
  })

  it('listBranches filters by prefix and returns sha', async () => {
    const git = simpleGit(testDir)
    await git.checkoutBranch('cr/content/blog/1700000000-aaaa', CONTENTRAIN_BRANCH)
    await writeFileSafe(join(testDir, '.contentrain/content/blog/en.json'), '{"a":1}\n')
    await git.raw(['add', '-A'])
    await git.commit('add blog')
    await git.checkout(CONTENTRAIN_BRANCH)

    const provider = new LocalProvider(testDir)
    const crBranches = await provider.listBranches('cr/')
    expect(crBranches.length).toBe(1)
    expect(crBranches[0]?.name).toBe('cr/content/blog/1700000000-aaaa')
    expect(crBranches[0]?.sha).toMatch(/^[0-9a-f]{7,}$/u)

    const all = await provider.listBranches()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('createBranch / deleteBranch round-trip', async () => {
    const provider = new LocalProvider(testDir)
    await provider.createBranch('cr/content/test/1700000000-bbbb', CONTENTRAIN_BRANCH)

    const listed = await provider.listBranches('cr/content/test/')
    expect(listed.map(b => b.name)).toContain('cr/content/test/1700000000-bbbb')

    await provider.deleteBranch('cr/content/test/1700000000-bbbb')
    const afterDelete = await provider.listBranches('cr/content/test/')
    expect(afterDelete.map(b => b.name)).not.toContain('cr/content/test/1700000000-bbbb')
  })

  it('getBranchDiff maps added/modified/removed', async () => {
    const git = simpleGit(testDir)
    await git.checkoutBranch('cr/content/blog/1700000000-cccc', CONTENTRAIN_BRANCH)
    await writeFileSafe(join(testDir, '.contentrain/content/blog/en.json'), '{"a":1}\n')
    await writeFileSafe(join(testDir, 'README.md'), 'updated\n')
    await git.raw(['add', '-A'])
    await git.commit('modify README + add blog')
    await git.checkout(CONTENTRAIN_BRANCH)

    const provider = new LocalProvider(testDir)
    const diff = await provider.getBranchDiff('cr/content/blog/1700000000-cccc')
    const byPath = new Map(diff.map(d => [d.path, d.status]))
    expect(byPath.get('.contentrain/content/blog/en.json')).toBe('added')
    expect(byPath.get('README.md')).toBe('modified')
  })

  it('isMerged returns true once the feature branch is merged into contentrain', async () => {
    const git = simpleGit(testDir)
    await git.checkoutBranch('cr/content/blog/1700000000-dddd', CONTENTRAIN_BRANCH)
    await writeFileSafe(join(testDir, '.contentrain/content/blog/en.json'), '{"a":1}\n')
    await git.raw(['add', '-A'])
    await git.commit('add blog')
    await git.checkout(CONTENTRAIN_BRANCH)

    const provider = new LocalProvider(testDir)
    expect(await provider.isMerged('cr/content/blog/1700000000-dddd')).toBe(false)

    await git.merge(['cr/content/blog/1700000000-dddd', '--no-edit', '--ff-only'])
    expect(await provider.isMerged('cr/content/blog/1700000000-dddd')).toBe(true)
  })

  it('mergeBranch rejects a target other than CONTENTRAIN_BRANCH', async () => {
    const provider = new LocalProvider(testDir)
    await expect(
      provider.mergeBranch('cr/content/any/1700000000-ffff', 'main'),
    ).rejects.toThrow(/only supports merging into/iu)
  })

  it('getDefaultBranch reads from config when present', async () => {
    await writeFileSafe(
      join(testDir, '.contentrain/config.json'),
      JSON.stringify({
        stack: 'nuxt',
        locales: { default: 'en', supported: ['en'] },
        domains: ['content'],
        workflow: 'auto-merge',
        repository: { default_branch: 'trunk' },
      }),
    )

    const provider = new LocalProvider(testDir)
    expect(await provider.getDefaultBranch()).toBe('trunk')
  })
})
