import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import {
  deleteRemoteBranch,
  listRemoteCrBranches,
  pruneMergedRemoteBranches,
} from '../../src/git/branch-lifecycle.js'
import { addBareRemote, remoteHeads } from '../fixtures/bare-remote.js'

// 90s, not 30s: these tests are real-git I/O heavy (push/ls-remote against a
// bare remote) and share the machine with the fork pool's other workers — at
// full-suite load the 30s default flakes even though each test runs in ~3s
// standalone.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 })

let testDir: string
let remoteDir: string

async function writeFileSafe(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function commitFile(git: SimpleGit, root: string, path: string, content: string, message: string): Promise<void> {
  await writeFileSafe(join(root, path), content)
  await git.raw(['add', '-A'])
  await git.commit(message)
}

/** Create a cr/* branch with one commit from contentrain and push it. */
async function pushedBranch(git: SimpleGit, root: string, name: string, file: string): Promise<void> {
  const base = (await git.raw(['branch', '--show-current'])).trim()
  await git.checkoutBranch(name, CONTENTRAIN_BRANCH)
  await commitFile(git, root, file, `{"from":"${name}"}\n`, `add ${file}`)
  await git.checkout(base)
  await git.push('origin', name)
}

async function mergeIntoContentrain(git: SimpleGit, name: string): Promise<void> {
  const base = (await git.raw(['branch', '--show-current'])).trim()
  await git.checkout(CONTENTRAIN_BRANCH)
  await git.merge([name, '--no-edit'])
  await git.checkout(base)
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-remote-test-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'ai@contentrain.io')
  await writeFileSafe(join(testDir, 'README.md'), 'base\n')
  await git.add('.')
  await git.commit('initial')
  await git.branch([CONTENTRAIN_BRANCH])
  remoteDir = await addBareRemote(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
  await rm(remoteDir, { recursive: true, force: true })
})

describe('deleteRemoteBranch', () => {
  it('deletes a pushed cr/* branch on the remote', async () => {
    const git = simpleGit(testDir)
    await pushedBranch(git, testDir, 'cr/content/a/1', '.contentrain/content/a/en.json')
    expect(await remoteHeads(remoteDir)).toContain('cr/content/a/1')

    const result = await deleteRemoteBranch(testDir, 'cr/content/a/1')

    expect(result.deleted).toBe(true)
    expect(result.warning).toBeUndefined()
    expect(await remoteHeads(remoteDir)).not.toContain('cr/content/a/1')
  })

  it('reports not-found for a branch that is not on the remote', async () => {
    const result = await deleteRemoteBranch(testDir, 'cr/content/ghost/1')
    expect(result.deleted).toBe(false)
    expect(result.skipped).toBe('not-found')
  })

  it('refuses non-cr and protected branches', async () => {
    expect((await deleteRemoteBranch(testDir, 'main')).skipped).toBe('protected')
    expect((await deleteRemoteBranch(testDir, CONTENTRAIN_BRANCH)).skipped).toBe('protected')
  })

  it('is a no-op when remoteBranchCleanup is disabled', async () => {
    const git = simpleGit(testDir)
    await pushedBranch(git, testDir, 'cr/content/b/1', '.contentrain/content/b/en.json')
    await writeFileSafe(join(testDir, '.contentrain', 'config.json'), JSON.stringify({
      version: 1, stack: 'other', workflow: 'review',
      locales: { default: 'en', supported: ['en'] }, domains: [],
      remoteBranchCleanup: false,
    }))

    const result = await deleteRemoteBranch(testDir, 'cr/content/b/1')

    expect(result.deleted).toBe(false)
    expect(result.skipped).toBe('disabled')
    expect(await remoteHeads(remoteDir)).toContain('cr/content/b/1')
  })

  it('reports no-remote when no remote is configured', async () => {
    await simpleGit(testDir).removeRemote('origin')
    const result = await deleteRemoteBranch(testDir, 'cr/content/c/1')
    expect(result.skipped).toBe('no-remote')
  })

  it('surfaces a warning when the remote is unreachable, without throwing', async () => {
    const git = simpleGit(testDir)
    await pushedBranch(git, testDir, 'cr/content/d/1', '.contentrain/content/d/en.json')
    await git.raw(['remote', 'set-url', 'origin', join(testDir, 'no-such-remote')])

    const result = await deleteRemoteBranch(testDir, 'cr/content/d/1')

    expect(result.deleted).toBe(false)
    expect(result.warning).toBeTruthy()
  })
})

describe('listRemoteCrBranches', () => {
  it('lists only cr/* heads with their shas', async () => {
    const git = simpleGit(testDir)
    await pushedBranch(git, testDir, 'cr/content/l/1', '.contentrain/content/l/en.json')
    await git.push('origin', CONTENTRAIN_BRANCH)

    const result = await listRemoteCrBranches(testDir)

    expect(result).not.toBeNull()
    expect(result!.error).toBeUndefined()
    expect(result!.branches.map(b => b.name)).toEqual(['cr/content/l/1'])
    expect(result!.branches[0]!.sha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('returns null when no remote is configured', async () => {
    await simpleGit(testDir).removeRemote('origin')
    expect(await listRemoteCrBranches(testDir)).toBeNull()
  })

  it('returns an error when the remote is unreachable', async () => {
    await simpleGit(testDir).raw(['remote', 'set-url', 'origin', join(testDir, 'no-such-remote')])
    const result = await listRemoteCrBranches(testDir)
    expect(result).not.toBeNull()
    expect(result!.error).toBeTruthy()
    expect(result!.branches).toEqual([])
  })
})

describe('pruneMergedRemoteBranches', () => {
  it('deletes merged remote branches and keeps unmerged ones', async () => {
    const git = simpleGit(testDir)
    await pushedBranch(git, testDir, 'cr/content/m/1', '.contentrain/content/m/en.json')
    await mergeIntoContentrain(git, 'cr/content/m/1')
    await pushedBranch(git, testDir, 'cr/content/u/1', '.contentrain/content/u/en.json')

    const result = await pruneMergedRemoteBranches(testDir)

    expect(result.deleted).toEqual(['cr/content/m/1'])
    expect(result.kept).toEqual(['cr/content/u/1'])
    expect(result.errors).toEqual([])
    const heads = await remoteHeads(remoteDir)
    expect(heads).not.toContain('cr/content/m/1')
    expect(heads).toContain('cr/content/u/1')
  })

  it('dryRun reports candidates without mutating the remote', async () => {
    const git = simpleGit(testDir)
    await pushedBranch(git, testDir, 'cr/content/m/2', '.contentrain/content/m2/en.json')
    await mergeIntoContentrain(git, 'cr/content/m/2')

    const result = await pruneMergedRemoteBranches(testDir, { dryRun: true })

    expect(result.deleted).toEqual(['cr/content/m/2'])
    expect(await remoteHeads(remoteDir)).toContain('cr/content/m/2')
  })

  it('caps deletions at max and keeps the overflow', async () => {
    const git = simpleGit(testDir)
    await pushedBranch(git, testDir, 'cr/content/m/3', '.contentrain/content/m3/en.json')
    await mergeIntoContentrain(git, 'cr/content/m/3')
    await pushedBranch(git, testDir, 'cr/content/m/4', '.contentrain/content/m4/en.json')
    await mergeIntoContentrain(git, 'cr/content/m/4')

    const result = await pruneMergedRemoteBranches(testDir, { max: 1 })

    expect(result.deleted).toHaveLength(1)
    expect(result.kept).toHaveLength(1)
    // Two cr/* heads were pushed; exactly one survives the capped prune.
    expect(await remoteHeads(remoteDir)).toHaveLength(1)
  })

  it('is a no-op when remoteBranchCleanup is disabled', async () => {
    await writeFileSafe(join(testDir, '.contentrain', 'config.json'), JSON.stringify({
      version: 1, stack: 'other', workflow: 'review',
      locales: { default: 'en', supported: ['en'] }, domains: [],
      remoteBranchCleanup: false,
    }))
    const result = await pruneMergedRemoteBranches(testDir)
    expect(result.skipped).toBe('disabled')
  })

  it('reports offline when the remote is unreachable', async () => {
    await simpleGit(testDir).raw(['remote', 'set-url', 'origin', join(testDir, 'no-such-remote')])
    const result = await pruneMergedRemoteBranches(testDir)
    expect(result.skipped).toBe('offline')
    expect(result.errors).toHaveLength(1)
  })
})
