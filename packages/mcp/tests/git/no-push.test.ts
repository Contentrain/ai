import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

// Real-git I/O against a bare remote, like transaction.test.ts.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { createGit } from '../../src/git/identity.js'
import { NO_PUSH_ENV } from '../../src/git/push-policy.js'
import { buildBranchName, createTransaction, ensureContentBranch, mergeBranch } from '../../src/git/transaction.js'
import { deleteRemoteBranch, pruneMergedRemoteBranches } from '../../src/git/branch-lifecycle.js'
import { writeJson, ensureDir } from '../../src/util/fs.js'
import { addCountingRemote, remoteHeads, type CountingRemote } from '../fixtures/bare-remote.js'

/**
 * Local mode (`git.push: false` / `CONTENTRAIN_NO_PUSH=1`): every write path
 * stays local. The witness is the remote itself — its pre-receive hook counts
 * every ref update that reaches it, so "zero pushes" is measured, not assumed.
 */

let testDir: string
let remote: CountingRemote
let defaultBranch: string

async function writeConfig(extra: Record<string, unknown>): Promise<void> {
  await writeJson(join(testDir, '.contentrain', 'config.json'), {
    version: 1,
    stack: 'other',
    workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en'] },
    domains: ['test'],
    ...extra,
  })
}

/** Commit a config change on the base branch and bring contentrain along. */
async function commitConfig(extra: Record<string, unknown>): Promise<void> {
  const git = createGit(testDir)
  await writeConfig(extra)
  await git.add('.')
  await git.commit('config')
  await git.raw(['branch', '-f', CONTENTRAIN_BRANCH, defaultBranch])
}

/** A cr/* branch with one commit, pushed to the remote (before local mode). */
async function seedPushedBranch(name: string): Promise<void> {
  const git = createGit(testDir)
  await git.checkoutBranch(name, CONTENTRAIN_BRANCH)
  await mkdir(join(testDir, '.contentrain', 'content', 'blog'), { recursive: true })
  await writeFile(join(testDir, '.contentrain', 'content', 'blog', 'en.json'), `{"from":"${name}"}\n`)
  await git.add('.')
  await git.commit('[contentrain] content: blog')
  await git.checkout(defaultBranch)
  await git.push('origin', name)
}

async function saveModel(branch: string, workflow?: 'review' | 'auto-merge') {
  const tx = await createTransaction(testDir, branch, workflow ? { workflowOverride: workflow } : undefined)
  await tx.write(async (wt) => {
    await writeJson(join(wt, '.contentrain', 'models', 'local.json'), { id: 'local', name: 'Local', kind: 'singleton', domain: 'test', i18n: false, title_field: 'title' })
  })
  const hash = await tx.commit('[contentrain] create: local', { tool: 'test', model: 'local' })
  const result = await tx.complete()
  await tx.cleanup()
  return { hash, result }
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-no-push-test-'))
  const git = createGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await ensureDir(join(testDir, '.contentrain'))
  await writeConfig({ git: { push: false } })
  await git.add('.')
  await git.commit('initial commit')
  defaultBranch = (await git.raw(['branch', '--show-current'])).trim()
  remote = await addCountingRemote(testDir)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(testDir, { recursive: true, force: true })
  await rm(remote.dir, { recursive: true, force: true })
})

describe('local mode: zero pushes on every git path', () => {
  it('ensureContentBranch creates the branch without publishing it', async () => {
    await ensureContentBranch(testDir)

    expect((await createGit(testDir).branchLocal()).all).toContain(CONTENTRAIN_BRANCH)
    expect(await remote.pushes()).toBe(0)
    expect(await remoteHeads(remote.dir)).toEqual([])
  })

  it('auto-merge lands on contentrain and the base, reports disabled, pushes nothing', async () => {
    const { result } = await saveModel('cr/model/local/1')

    expect(result.action).toBe('auto-merged')
    expect(result.remote_push).toBe('disabled')
    const git = createGit(testDir)
    expect(await git.show([`${CONTENTRAIN_BRANCH}:.contentrain/models/local.json`])).toContain('"local"')
    expect(await git.show([`${defaultBranch}:.contentrain/models/local.json`])).toContain('"local"')
    expect(await remote.pushes()).toBe(0)
    expect(await remoteHeads(remote.dir)).toEqual([])
  })

  it('review keeps the branch locally, reports disabled, pushes nothing', async () => {
    const branch = buildBranchName('model', 'local')
    const { hash, result } = await saveModel(branch, 'review')

    expect(result.action).toBe('pending-review')
    expect(result.commit).toBe(hash)
    expect(result.remote_push).toBe('disabled')
    expect(result.warning).toBeUndefined()
    expect((await createGit(testDir).branchLocal()).all).toContain(branch)
    expect(await remote.pushes()).toBe(0)
  })

  it('the env alone turns pushing off', async () => {
    await commitConfig({})
    vi.stubEnv(NO_PUSH_ENV, '1')

    const { result } = await saveModel('cr/model/local/env')

    expect(result.remote_push).toBe('disabled')
    expect(await remote.pushes()).toBe(0)
  })

  it('mergeBranch merges, deletes the local branch fully, leaves the remote copy', async () => {
    await commitConfig({})
    const branch = 'cr/content/blog/1700000000-lm'
    await seedPushedBranch(branch)
    await commitConfig({ git: { push: false } })
    await remote.reset()

    const result = await mergeBranch(testDir, branch)

    expect(result.action).toBe('merged')
    expect(result.remote_push).toBe('disabled')
    expect(result.remote).toEqual({ deleted: false, skipped: 'local-mode' })
    // Not half-deleted: the local ref is gone, the remote copy is untouched.
    expect((await createGit(testDir).branchLocal()).all).not.toContain(branch)
    expect(await remoteHeads(remote.dir)).toContain(branch)
    expect(await remote.pushes()).toBe(0)
  })

  it('deleteRemoteBranch and pruneMergedRemoteBranches skip without a push', async () => {
    await commitConfig({})
    const branch = 'cr/content/blog/1700000000-pr'
    await seedPushedBranch(branch)
    await createGit(testDir).raw(['branch', '-f', CONTENTRAIN_BRANCH, branch])
    await commitConfig({ git: { push: false } })
    await remote.reset()

    expect(await deleteRemoteBranch(testDir, branch)).toEqual({ deleted: false, skipped: 'local-mode' })
    expect(await pruneMergedRemoteBranches(testDir)).toEqual({ deleted: [], kept: [], errors: [], skipped: 'local-mode' })
    expect(await remoteHeads(remote.dir)).toContain(branch)
    expect(await remote.pushes()).toBe(0)
  })
})

describe('local mode off: pushing unchanged', () => {
  it('pushes by default', async () => {
    await commitConfig({})

    const { result } = await saveModel('cr/model/local/on')

    expect(result.remote_push).toBe('pushed')
    expect(await remote.pushes()).toBeGreaterThan(0)
    expect(await remoteHeads(remote.dir)).toContain(CONTENTRAIN_BRANCH)
  })

  it('CONTENTRAIN_NO_PUSH=0 overrides git.push: false', async () => {
    vi.stubEnv(NO_PUSH_ENV, '0')

    const { result } = await saveModel('cr/model/local/override')

    expect(result.remote_push).toBe('pushed')
    expect(await remoteHeads(remote.dir)).toContain(CONTENTRAIN_BRANCH)
  })

  it('mergeBranch still deletes the remote copy', async () => {
    await commitConfig({})
    const branch = 'cr/content/blog/1700000000-on'
    await seedPushedBranch(branch)

    const result = await mergeBranch(testDir, branch)

    expect(result.remote?.deleted).toBe(true)
    expect(await remoteHeads(remote.dir)).not.toContain(branch)
  })
})
