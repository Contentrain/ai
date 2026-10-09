import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

// Real-git I/O, like no-push.test.ts.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { createGit } from '../../src/git/identity.js'
import { VERIFY_ENV } from '../../src/git/hook-policy.js'
import { buildBranchName, createTransaction, mergeBranch } from '../../src/git/transaction.js'
import { writeJson, ensureDir } from '../../src/util/fs.js'

/**
 * Commit hooks on machine commits (#510): skipped by default, run with
 * `git.verify: true` / `CONTENTRAIN_VERIFY=1`, and a rejecting hook fails the
 * write with its output — nothing is retried without hooks. The witness is
 * the hook itself: it appends a line to a marker file outside the repo.
 *
 * The repo's local `core.hooksPath` points at a directory the test owns, so a
 * developer's global hooksPath cannot leak in.
 */

let testDir: string
let hooksDir: string
let marker: string
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

async function installHook(name: string, body: string): Promise<void> {
  const path = join(hooksDir, name)
  await writeFile(path, `#!/bin/sh\n${body}\n`)
  await chmod(path, 0o755)
}

async function hookRuns(): Promise<string[]> {
  return (await readFile(marker, 'utf-8').catch(() => '')).split('\n').filter(Boolean)
}

async function saveModel(id: string, workflow?: 'review' | 'auto-merge') {
  const tx = await createTransaction(testDir, buildBranchName('model', id), workflow ? { workflowOverride: workflow } : undefined)
  try {
    await tx.write(async (wt) => {
      await writeJson(join(wt, '.contentrain', 'models', `${id}.json`), { id, name: id, kind: 'singleton', domain: 'test', i18n: false, title_field: 'title' })
    })
    await tx.commit(`[contentrain] create: ${id}`, { tool: 'test', model: id })
    return await tx.complete()
  } finally {
    await tx.cleanup()
  }
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-hooks-test-'))
  hooksDir = await mkdtemp(join(tmpdir(), 'cr-hooks-dir-'))
  marker = join(hooksDir, 'runs.log')
  const git = createGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await ensureDir(join(testDir, '.contentrain'))
  await writeConfig({})
  await git.add('.')
  await git.commit('initial commit')
  defaultBranch = (await git.raw(['branch', '--show-current'])).trim()
  // Installed after the fixture commit, so only Contentrain's commits can hit it.
  // Plain git: simple-git refuses to set core.hooksPath.
  execFileSync('git', ['config', 'core.hooksPath', hooksDir], { cwd: testDir })
  await installHook('pre-commit', `echo "pre-commit $(git rev-parse --abbrev-ref HEAD)" >> "${marker}"`)
  await installHook('commit-msg', `echo "commit-msg $(head -n 1 "$1")" >> "${marker}"`)
})

afterEach(async () => {
  delete process.env[VERIFY_ENV]
  await rm(testDir, { recursive: true, force: true })
  await rm(hooksDir, { recursive: true, force: true })
})

describe('commit hooks on machine commits', () => {
  it('are skipped by default, as before', async () => {
    const result = await saveModel('plain')
    expect(result.action).toBe('auto-merged')
    expect(await hookRuns()).toEqual([])
  })

  it('run on the content commit and the context commit with git.verify: true', async () => {
    await writeConfig({ git: { verify: true } })
    const result = await saveModel('verified')
    expect(result.action).toBe('auto-merged')
    const runs = await hookRuns()
    expect(runs).toContain('commit-msg [contentrain] create: verified')
    expect(runs).toContain('commit-msg [contentrain] context: update')
    expect(runs.filter(r => r.startsWith('pre-commit cr/model/verified/'))).toHaveLength(1)
    expect(runs).toContain(`pre-commit ${CONTENTRAIN_BRANCH}`)
  })

  it('run with CONTENTRAIN_VERIFY=1 over a config that does not ask for them', async () => {
    process.env[VERIFY_ENV] = '1'
    await saveModel('env-on')
    expect(await hookRuns()).toContain('commit-msg [contentrain] create: env-on')
  })

  it('are skipped with CONTENTRAIN_VERIFY=0 over git.verify: true', async () => {
    await writeConfig({ git: { verify: true } })
    process.env[VERIFY_ENV] = '0'
    await saveModel('env-off')
    expect(await hookRuns()).toEqual([])
  })

  it('a rejecting hook fails the write with its output, and nothing lands', async () => {
    await writeConfig({ git: { verify: true } })
    await installHook('pre-commit', 'echo "lint failed: models/rejected.json" >&2\nexit 1')
    const git = createGit(testDir)
    const baseBefore = (await git.raw(['rev-parse', defaultBranch])).trim()
    const contentrainBefore = (await git.raw(['rev-parse', CONTENTRAIN_BRANCH]).catch(() => '')).trim()

    await expect(saveModel('rejected')).rejects.toThrow(/lint failed: models\/rejected\.json/)

    expect((await git.raw(['rev-parse', defaultBranch])).trim()).toBe(baseBefore)
    // contentrain is created from the base on the first write; it gains no commit.
    expect((await git.raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()).toBe(contentrainBefore || baseBefore)
    const log = await git.raw(['log', '--all', '--format=%s'])
    expect(log).not.toContain('[contentrain] create: rejected')
  })

  it('a hook that rejects only the context commit is reported, not swallowed (the content already landed)', async () => {
    await writeConfig({ git: { verify: true } })
    await installHook('commit-msg', 'case "$(head -n 1 "$1")" in *context*) echo "commitlint: subject must be conventional" >&2; exit 1;; esac')
    const result = await saveModel('ctx')
    expect(result.action).toBe('auto-merged')
    expect(result.warning).toMatch(/context\.json was not updated: .*commitlint: subject must be conventional/s)
    const log = await createGit(testDir).raw(['log', CONTENTRAIN_BRANCH, '--format=%s'])
    expect(log).toContain('[contentrain] create: ctx')
    expect(log).not.toContain('[contentrain] context: update')
  })

  it('run on the context commit a review-branch merge makes', async () => {
    await writeConfig({ git: { verify: true } })
    const review = await saveModel('reviewed', 'review')
    expect(review.action).toBe('pending-review')
    await writeFile(marker, '')
    const branch = (await createGit(testDir).raw(['for-each-ref', '--format=%(refname:short)', 'refs/heads/cr/model/reviewed/'])).trim()
    expect(branch).not.toBe('')
    const merged = await mergeBranch(testDir, branch)
    expect(merged.action).toBe('merged')
    expect(await hookRuns()).toContain('commit-msg [contentrain] context: update')
  })
})

describe('the resolved base branch is reported (#509)', () => {
  it('names the base branch, not the checked-out feature branch, and warns', async () => {
    const git = createGit(testDir)
    await git.checkoutLocalBranch('feature/x')
    const result = await saveModel('from-feature')
    expect(result.base_branch).toBe(defaultBranch)
    expect(result.warning).toContain('feature/x')
    expect((await git.raw(['branch', '--show-current'])).trim()).toBe('feature/x')
  })

  it('is reported on a review save too', async () => {
    const result = await saveModel('rev', 'review')
    expect(result.base_branch).toBe(defaultBranch)
  })
})
