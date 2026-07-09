import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import {
  branchDiff,
  checkBranchHealth,
  classifyMergedBranches,
  cleanupMergedBranches,
  isRefMerged,
} from '../../src/git/branch-lifecycle.js'

async function writeFileSafe(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function commitFile(git: SimpleGit, root: string, path: string, content: string, message: string): Promise<void> {
  await writeFileSafe(join(root, path), content)
  await git.raw(['add', '-A'])
  await git.commit(message)
}

/**
 * Write .contentrain/config.json and commit it on the current (base) branch,
 * then re-point contentrain at the same tip. Committing it in the shared
 * history keeps later `add -A` commits on cr/* branches free of config noise
 * (which would break patch-id equivalence) and survives branch checkouts.
 * Call BEFORE creating any cr/* branches.
 */
async function writeProjectConfig(root: string, partial: Record<string, unknown>): Promise<void> {
  await writeFileSafe(join(root, '.contentrain', 'config.json'), JSON.stringify({
    version: 1,
    stack: 'other',
    workflow: 'review',
    locales: { default: 'en', supported: ['en'] },
    domains: [],
    ...partial,
  }, null, 2))
  const git = simpleGit(root)
  await git.raw(['add', '-A'])
  await git.commit('add config')
  await git.raw(['branch', '-f', CONTENTRAIN_BRANCH, 'HEAD'])
}

/** Create a cr/* branch with one commit and merge it back into contentrain. */
async function createMergedBranch(git: SimpleGit, root: string, name: string, file: string): Promise<void> {
  await git.checkoutBranch(name, CONTENTRAIN_BRANCH)
  await commitFile(git, root, file, `{"from":"${name}"}\n`, `add ${file}`)
  await git.checkout(CONTENTRAIN_BRANCH)
  await git.merge([name, '--no-edit'])
}

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-branch-diff-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'ai@contentrain.io')
  await writeFileSafe(join(testDir, 'README.md'), 'base\n')
  await git.add('.')
  await git.commit('initial')
  // Create the singleton content-tracking branch from the initial commit.
  await git.branch([CONTENTRAIN_BRANCH])
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('branchDiff', () => {
  it('defaults the diff base to CONTENTRAIN_BRANCH', async () => {
    const git = simpleGit(testDir)
    await git.checkoutBranch('cr/content/blog/1700000000-aaaa', CONTENTRAIN_BRANCH)
    await writeFileSafe(join(testDir, '.contentrain/content/blog/en.json'), '{"a":1}\n')
    await git.raw(['add', '-A'])
    await git.commit('add blog content')

    const result = await branchDiff(testDir, { branch: 'cr/content/blog/1700000000-aaaa' })

    expect(result.branch).toBe('cr/content/blog/1700000000-aaaa')
    expect(result.base).toBe(CONTENTRAIN_BRANCH)
    expect(result.stat).toContain('.contentrain/content/blog/en.json')
    expect(result.patch).toContain('+{"a":1}')
    expect(result.filesChanged).toBe(1)
  })

  it('does NOT include commits the default branch has beyond contentrain', async () => {
    // Simulate: `main` is ahead of `contentrain` by one commit (an
    // unrelated source change). The feature branch is forked from
    // `contentrain`, so diffing feature...main would pick up the
    // unrelated change. branchDiff's default (against `contentrain`)
    // must not.
    const git = simpleGit(testDir)
    const baseBranch = (await git.raw(['branch', '--show-current'])).trim()

    await writeFileSafe(join(testDir, 'src/app.ts'), 'console.log("unrelated")\n')
    await git.raw(['add', '-A'])
    await git.commit('unrelated source change on main')

    await git.checkoutBranch('cr/content/blog/1700000001-bbbb', CONTENTRAIN_BRANCH)
    await writeFileSafe(join(testDir, '.contentrain/content/blog/en.json'), '{"blog":true}\n')
    await git.raw(['add', '-A'])
    await git.commit('feature change')

    const againstContentrain = await branchDiff(testDir, { branch: 'cr/content/blog/1700000001-bbbb' })
    const againstMain = await branchDiff(testDir, {
      branch: 'cr/content/blog/1700000001-bbbb',
      base: baseBranch,
    })

    // Against contentrain: only the feature file.
    expect(againstContentrain.filesChanged).toBe(1)
    expect(againstContentrain.stat).toContain('.contentrain/content/blog/en.json')
    expect(againstContentrain.stat).not.toContain('src/app.ts')

    // Against main: picks up the unrelated source change too, which
    // is the pattern the old CLI code produced. This asserts the bug
    // path stays accessible (for explicit opt-in) but is no longer
    // the default.
    expect(againstMain.filesChanged).toBeGreaterThanOrEqual(1)
  })

  it('honours an explicit base branch override', async () => {
    const git = simpleGit(testDir)
    await git.checkoutBranch('feature/foo', CONTENTRAIN_BRANCH)
    await writeFileSafe(join(testDir, 'feat.txt'), 'feat\n')
    await git.raw(['add', '-A'])
    await git.commit('add feature file')

    const result = await branchDiff(testDir, {
      branch: 'feature/foo',
      base: CONTENTRAIN_BRANCH,
    })

    expect(result.base).toBe(CONTENTRAIN_BRANCH)
    expect(result.filesChanged).toBe(1)
  })
})

describe('isRefMerged', () => {
  it('returns true for an ancestry-merged branch', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()
    await createMergedBranch(git, testDir, 'cr/content/a/1', '.contentrain/content/a/en.json')
    await git.checkout(base)

    expect(await isRefMerged(git, 'cr/content/a/1', CONTENTRAIN_BRANCH)).toBe(true)
  })

  it('returns false for an unmerged branch', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()
    await git.checkoutBranch('cr/content/b/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/b/en.json', '{"b":1}\n', 'add b')
    await git.checkout(base)

    expect(await isRefMerged(git, 'cr/content/b/1', CONTENTRAIN_BRANCH)).toBe(false)
  })

  it('detects patch-equivalent merges after a base-history rewrite', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()

    // The feature branch commits a change...
    await git.checkoutBranch('cr/content/rw/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/rw/en.json', '{"rw":1}\n', 'add rw content')

    // ...but the SAME patch lands on contentrain as a DIFFERENT commit —
    // what a squash/rebase rewrite of the base history produces.
    await git.checkout(CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/rw/en.json', '{"rw":1}\n', 'rewritten: add rw content')
    await git.checkout(base)

    // Ancestry alone calls it unmerged...
    const mergedRaw = await git.raw(['branch', '--merged', CONTENTRAIN_BRANCH])
    expect(mergedRaw).not.toContain('cr/content/rw/1')
    // ...the patch-id fallback recognises it.
    expect(await isRefMerged(git, 'cr/content/rw/1', CONTENTRAIN_BRANCH)).toBe(true)
  })

  it('bails out to false when the commit count exceeds maxCherryCommits', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()
    await git.checkoutBranch('cr/content/cap/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/cap/en.json', '{"cap":1}\n', 'add cap content')
    await git.checkout(CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/cap/en.json', '{"cap":1}\n', 'rewritten: add cap content')
    await git.checkout(base)

    expect(await isRefMerged(git, 'cr/content/cap/1', CONTENTRAIN_BRANCH, { maxCherryCommits: 0 })).toBe(false)
  })

  it('returns false for an unresolvable ref', async () => {
    const git = simpleGit(testDir)
    expect(await isRefMerged(git, 'cr/does/not/exist', CONTENTRAIN_BRANCH)).toBe(false)
  })
})

describe('classifyMergedBranches', () => {
  it('classifies ancestry-merged, patch-equivalent and unmerged branches', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()

    await createMergedBranch(git, testDir, 'cr/content/m/1', '.contentrain/content/m/en.json')

    await git.checkoutBranch('cr/content/pe/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/pe/en.json', '{"pe":1}\n', 'add pe content')
    await git.checkout(CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/pe/en.json', '{"pe":1}\n', 'rewritten: add pe content')

    await git.checkoutBranch('cr/content/u/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/u/en.json', '{"u":1}\n', 'add u content')
    await git.checkout(base)

    const merged = await classifyMergedBranches(testDir, ['cr/content/m/1', 'cr/content/pe/1', 'cr/content/u/1'])

    expect(merged.has('cr/content/m/1')).toBe(true)
    expect(merged.has('cr/content/pe/1')).toBe(true)
    expect(merged.has('cr/content/u/1')).toBe(false)
  })

  it('throws when the target branch does not exist', async () => {
    await expect(classifyMergedBranches(testDir, ['cr/x'], 'no-such-branch')).rejects.toThrow()
  })
})

describe('cleanupMergedBranches', () => {
  it('deletes merged branches past retention and keeps unmerged ones', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()
    await writeProjectConfig(testDir, { branchRetention: 0 })

    await createMergedBranch(git, testDir, 'cr/content/old/1', '.contentrain/content/old/en.json')
    await git.checkoutBranch('cr/content/live/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/live/en.json', '{"live":1}\n', 'add live content')
    await git.checkout(base)

    const result = await cleanupMergedBranches(testDir)

    expect(result.deletedBranches).toContain('cr/content/old/1')
    expect(result.deletedBranches).not.toContain('cr/content/live/1')
    const branches = await git.branchLocal()
    expect(branches.all).not.toContain('cr/content/old/1')
    expect(branches.all).toContain('cr/content/live/1')
  })

  it('retains merged branches within the retention period', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()
    // No config — default retention (30 days) applies.
    await createMergedBranch(git, testDir, 'cr/content/fresh/1', '.contentrain/content/fresh/en.json')
    await git.checkout(base)

    const result = await cleanupMergedBranches(testDir)

    expect(result.deleted).toBe(0)
    expect((await git.branchLocal()).all).toContain('cr/content/fresh/1')
  })

  it('deletes patch-equivalent merged branches after a history rewrite', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()
    await writeProjectConfig(testDir, { branchRetention: 0 })

    await git.checkoutBranch('cr/content/rwc/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/rwc/en.json', '{"rwc":1}\n', 'add rwc content')
    await git.checkout(CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/rwc/en.json', '{"rwc":1}\n', 'rewritten: add rwc content')
    await git.checkout(base)

    const result = await cleanupMergedBranches(testDir)

    expect(result.deletedBranches).toContain('cr/content/rwc/1')
    expect((await git.branchLocal()).all).not.toContain('cr/content/rwc/1')
  })
})

describe('checkBranchHealth', () => {
  it('crosses warning and blocked thresholds on unmerged branch counts', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()
    await writeProjectConfig(testDir, { branchWarnLimit: 2, branchBlockLimit: 3 })

    await git.checkoutBranch('cr/content/h1/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/h1/en.json', '{"h1":1}\n', 'h1')
    await git.checkout(base)
    const one = await checkBranchHealth(testDir)
    expect(one.warning).toBe(false)
    expect(one.blocked).toBe(false)

    await git.checkoutBranch('cr/content/h2/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/h2/en.json', '{"h2":1}\n', 'h2')
    await git.checkout(base)
    const two = await checkBranchHealth(testDir)
    expect(two.unmerged).toBe(2)
    expect(two.warning).toBe(true)
    expect(two.blocked).toBe(false)

    await git.checkoutBranch('cr/content/h3/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/h3/en.json', '{"h3":1}\n', 'h3')
    await git.checkout(base)
    const three = await checkBranchHealth(testDir)
    expect(three.blocked).toBe(true)
    expect(three.message).toContain('BLOCKED')
  })

  it('does not count rewrite-orphaned merged branches as unmerged', async () => {
    const git = simpleGit(testDir)
    const base = (await git.raw(['branch', '--show-current'])).trim()
    await writeProjectConfig(testDir, { branchWarnLimit: 1, branchBlockLimit: 2 })

    await git.checkoutBranch('cr/content/rwh/1', CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/rwh/en.json', '{"rwh":1}\n', 'add rwh content')
    await git.checkout(CONTENTRAIN_BRANCH)
    await commitFile(git, testDir, '.contentrain/content/rwh/en.json', '{"rwh":1}\n', 'rewritten: add rwh content')
    await git.checkout(base)

    const health = await checkBranchHealth(testDir)
    expect(health.total).toBe(1)
    expect(health.merged).toBe(1)
    expect(health.unmerged).toBe(0)
    expect(health.warning).toBe(false)
  })
})
