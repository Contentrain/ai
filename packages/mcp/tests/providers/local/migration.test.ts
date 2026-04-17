import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { migrateLegacyBranches } from '../../../src/providers/local/migration.js'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-migration-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@contentrain.io')
  await writeFile(join(testDir, 'README.md'), 'seed\n')
  await git.add('.')
  await git.commit('initial')
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('migrateLegacyBranches', () => {
  it('deletes merged contentrain/* branches and clears the namespace', async () => {
    const git = simpleGit(testDir)
    // Create two merged legacy branches (no divergence from main).
    await git.branch(['contentrain/legacy-merged-1'])
    await git.branch(['contentrain/legacy-merged-2'])

    const baseBranch = (await git.raw(['branch', '--show-current'])).trim() || 'main'
    const deleted = await migrateLegacyBranches(git, baseBranch)

    expect(deleted).toBe(2)
    const remaining = (await git.branchLocal()).all.filter(b => b.startsWith('contentrain/'))
    expect(remaining).toEqual([])
  })

  it('force-deletes unmerged contentrain/* branches so the namespace clears', async () => {
    const git = simpleGit(testDir)
    // Diverge a legacy branch so `branch -d` would refuse it.
    await git.checkoutBranch('contentrain/legacy-unmerged', 'HEAD')
    await writeFile(join(testDir, 'diverged.txt'), 'diverged\n')
    await git.add('.')
    await git.commit('diverged commit')
    // Return to base so `branch -D` can delete the current branch target.
    await git.checkout('main').catch(async () => {
      // Some environments default to `master`.
      await git.checkout('master')
    })

    const baseBranch = (await git.raw(['branch', '--show-current'])).trim()
    const deleted = await migrateLegacyBranches(git, baseBranch)

    expect(deleted).toBeGreaterThanOrEqual(1)
    const remaining = (await git.branchLocal()).all.filter(b => b.startsWith('contentrain/'))
    expect(remaining).toEqual([])
  })

  it('is a no-op when there are no legacy branches', async () => {
    const git = simpleGit(testDir)
    const baseBranch = (await git.raw(['branch', '--show-current'])).trim() || 'main'
    const deleted = await migrateLegacyBranches(git, baseBranch)
    expect(deleted).toBe(0)
  })

  it('is idempotent — a second run after cleanup returns 0', async () => {
    const git = simpleGit(testDir)
    await git.branch(['contentrain/legacy-a'])
    const baseBranch = (await git.raw(['branch', '--show-current'])).trim() || 'main'

    const first = await migrateLegacyBranches(git, baseBranch)
    const second = await migrateLegacyBranches(git, baseBranch)

    expect(first).toBe(1)
    expect(second).toBe(0)
  })
})
