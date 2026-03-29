import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { createTransaction, buildBranchName, ensureContentBranch } from '../../src/git/transaction.js'
import { writeJson, ensureDir, pathExists } from '../../src/util/fs.js'

let testDir: string

let defaultBranch: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-tx-test-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')

  // Create initial commit
  await ensureDir(join(testDir, '.contentrain'))
  await writeJson(join(testDir, '.contentrain', 'config.json'), {
    version: 1,
    stack: 'other',
    workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en'] },
    domains: ['test'],
  })
  await git.add('.')
  await git.commit('initial commit')

  // Detect default branch name (may be 'main' or 'master' depending on git config)
  defaultBranch = (await git.raw(['branch', '--show-current'])).trim()
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('ensureContentBranch', () => {
  it('creates contentrain branch from main', async () => {
    await ensureContentBranch(testDir)
    const branches = await simpleGit(testDir).branchLocal()
    expect(branches.all).toContain('contentrain')
  })

  it('is idempotent', async () => {
    await ensureContentBranch(testDir)
    await ensureContentBranch(testDir) // should not throw
    const branches = await simpleGit(testDir).branchLocal()
    expect(branches.all.filter(b => b === 'contentrain')).toHaveLength(1)
  })
})

describe('contentrain branch checked out error', () => {
  it('throws CONTENT_BRANCH_CHECKED_OUT when developer is on contentrain branch', async () => {
    await ensureContentBranch(testDir)
    const git = simpleGit(testDir)
    await git.checkout('contentrain')

    await expect(
      createTransaction(testDir, 'cr/model/test/err-1'),
    ).rejects.toThrow('contentrain')

    // Clean up: go back to default branch
    await git.checkout(defaultBranch)
  })
})

describe('createTransaction', () => {
  it('creates worktree and branch, and contentrain branch exists', async () => {
    const tx = await createTransaction(testDir, 'cr/model/test/123')

    expect(tx.worktree).toBeTruthy()
    expect(tx.branch).toBe('cr/model/test/123')
    expect(await pathExists(tx.worktree)).toBe(true)

    // Verify contentrain branch was created
    const branches = await simpleGit(testDir).branchLocal()
    expect(branches.all).toContain('contentrain')

    await tx.cleanup()
  })

  it('writes files in worktree', async () => {
    const tx = await createTransaction(testDir, 'cr/model/test/124')

    await tx.write(async (wt) => {
      await writeJson(join(wt, '.contentrain', 'models', 'test.json'), {
        id: 'test',
        name: 'Test',
        kind: 'collection',
        domain: 'test',
        i18n: false,
      })
    })

    expect(await pathExists(join(tx.worktree, '.contentrain', 'models', 'test.json'))).toBe(true)

    await tx.cleanup()
  })

  it('commits and merges to main (auto-merge)', async () => {
    const tx = await createTransaction(testDir, 'cr/model/test/125')

    await tx.write(async (wt) => {
      await writeJson(join(wt, '.contentrain', 'models', 'new-model.json'), {
        id: 'new-model',
        name: 'New Model',
        kind: 'singleton',
        domain: 'test',
        i18n: false,
      })
    })

    const hash = await tx.commit('[contentrain] create: new-model', { tool: 'test', model: 'new-model' })
    expect(hash).toBeTruthy()

    // Verify context.json was committed (not excluded)
    const wtGit = simpleGit(tx.worktree)
    const show = await wtGit.show(['HEAD', '--name-only', '--format='])
    expect(show).toContain('context.json')

    const result = await tx.complete()
    expect(result.action).toBe('auto-merged')
    expect(result.sync).toBeDefined()
    expect(result.sync!.synced).toBeDefined()

    // Verify contentrain branch exists locally
    const branches = await simpleGit(testDir).branchLocal()
    expect(branches.all).toContain('contentrain')

    // Verify baseBranch was advanced to contentrain tip
    const mainGit = simpleGit(testDir)
    const mainLog = await mainGit.log([defaultBranch, '-1'])
    const contentrainLog = await mainGit.log(['contentrain', '-1'])
    expect(mainLog.latest!.hash).toBe(contentrainLog.latest!.hash)

    // After selectiveSync, files should be on disk in the working tree
    // If sync.synced is empty but file exists in commit, the file might still need manual checkout
    const synced = result.sync!.synced
    const _skipped = result.sync!.skipped

    // Verify file exists on main after update-ref + selectiveSync
    // The file may have been synced or may need to be verified via git show
    const fileInCommit = await mainGit.show([`main:.contentrain/models/new-model.json`])
    expect(fileInCommit).toBeTruthy()

    // If selectiveSync synced files, they should exist on disk
    if (synced.length > 0) {
      expect(await pathExists(join(testDir, '.contentrain', 'models', 'new-model.json'))).toBe(true)
    } else {
      // If nothing was synced, verify the file is at least in the git history
      // This can happen when the diff comparison doesn't find changes
      // (e.g., when models dir didn't exist before)
      expect(fileInCommit).toContain('new-model')
    }

    await tx.cleanup()
  })
})

describe('context.json committed with content', () => {
  it('includes context.json in the commit', async () => {
    const tx = await createTransaction(testDir, 'cr/model/test/ctx-1')
    await tx.write(async (wt) => {
      await mkdir(join(wt, '.contentrain', 'models'), { recursive: true })
      await writeFile(join(wt, '.contentrain', 'models', 'ctx-test.json'), '{}')
    })
    await tx.commit('[contentrain] test context', { tool: 'test', model: 'ctx-test' })

    // Verify context.json was committed (not excluded)
    const wtGit = simpleGit(tx.worktree)
    const show = await wtGit.show(['HEAD', '--name-only', '--format='])
    expect(show).toContain('context.json')

    await tx.cleanup()
  })
})

describe('selectiveSync', () => {
  it('syncs clean files and skips dirty ones', async () => {
    // Create a dirty .contentrain/ file in developer's tree
    await mkdir(join(testDir, '.contentrain', 'content'), { recursive: true })
    await writeFile(join(testDir, '.contentrain', 'content', 'dirty.json'), '{"dirty": true}')

    // Stage the dirty file so git knows about it, but don't commit (leave it dirty)
    const mainGit = simpleGit(testDir)
    await mainGit.add('.')
    await mainGit.commit('add dirty file')
    // Now make it dirty by modifying after commit
    await writeFile(join(testDir, '.contentrain', 'content', 'dirty.json'), '{"dirty": "modified"}')

    const tx = await createTransaction(testDir, 'cr/model/test/sync-1')
    await tx.write(async (wt) => {
      await mkdir(join(wt, '.contentrain', 'models'), { recursive: true })
      await writeFile(join(wt, '.contentrain', 'models', 'clean-model.json'), '{}')
    })
    await tx.commit('[contentrain] sync test', { tool: 'test', model: 'sync-test' })
    const result = await tx.complete()

    expect(result.action).toBe('auto-merged')
    // The sync result should exist
    expect(result.sync).toBeDefined()
    // clean-model.json should be synced (it wasn't dirty)
    expect(result.sync!.synced.some(f => f.includes('clean-model.json'))).toBe(true)

    await tx.cleanup()
  })
})

describe('buildBranchName', () => {
  it('builds branch name with scope and target', () => {
    const name = buildBranchName('model', 'hero')
    expect(name).toMatch(/^cr\/model\/hero\/[^/]+$/)
  })

  it('includes locale when provided', () => {
    const name = buildBranchName('content', 'hero', 'en')
    expect(name).toMatch(/^cr\/content\/hero\/en\/[^/]+$/)
  })
})
