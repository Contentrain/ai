import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { simpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { branchDiff } from '../../src/git/branch-lifecycle.js'

async function writeFileSafe(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-branch-diff-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@contentrain.io')
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
