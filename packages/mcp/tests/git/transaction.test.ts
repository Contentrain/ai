import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 })
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { createTransaction, buildBranchName } from '../../src/git/transaction.js'
import { writeJson, ensureDir, pathExists } from '../../src/util/fs.js'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-tx-test-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')

  // Create initial commit so we have a main branch
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
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('createTransaction', () => {
  it('creates worktree and branch', async () => {
    const tx = await createTransaction(testDir, 'contentrain/model/test/123')

    expect(tx.worktree).toBeTruthy()
    expect(tx.branch).toBe('contentrain/model/test/123')
    expect(await pathExists(tx.worktree)).toBe(true)

    await tx.cleanup()
  })

  it('writes files in worktree', async () => {
    const tx = await createTransaction(testDir, 'contentrain/model/test/124')

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
    const tx = await createTransaction(testDir, 'contentrain/model/test/125')

    await tx.write(async (wt) => {
      await writeJson(join(wt, '.contentrain', 'models', 'new-model.json'), {
        id: 'new-model',
        name: 'New Model',
        kind: 'singleton',
        domain: 'test',
        i18n: false,
      })
    })

    const hash = await tx.commit('[contentrain] create: new-model')
    expect(hash).toBeTruthy()

    const result = await tx.complete()
    expect(result.action).toBe('auto-merged')

    // Verify file exists on main after merge
    expect(await pathExists(join(testDir, '.contentrain', 'models', 'new-model.json'))).toBe(true)

    await tx.cleanup()
  })
})

describe('buildBranchName', () => {
  it('builds branch name with scope and target', () => {
    const name = buildBranchName('model', 'hero')
    expect(name).toMatch(/^contentrain\/model\/hero\/[^/]+$/)
  })

  it('includes locale when provided', () => {
    const name = buildBranchName('content', 'hero', 'en')
    expect(name).toMatch(/^contentrain\/content\/hero\/en\/[^/]+$/)
  })
})
