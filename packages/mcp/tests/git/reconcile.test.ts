import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { ensureContentBranch } from '../../src/git/transaction.js'
import { reconcileBranches } from '../../src/git/reconcile.js'
import { writeJson, ensureDir } from '../../src/util/fs.js'

let testDir: string
let defaultBranch: string

const MODEL_PATH = '.contentrain/models/faq.json'
const CONTENT_PATH = '.contentrain/content/site/faq/en.json'

function model(withTitleField: boolean): Record<string, unknown> {
  return {
    id: 'faq',
    name: 'FAQ',
    kind: 'collection',
    domain: 'site',
    i18n: true,
    ...(withTitleField ? { title_field: 'question' } : {}),
    fields: { question: { type: 'text', required: true }, answer: { type: 'text' } },
  }
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-reconcile-test-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')

  await ensureDir(join(testDir, '.contentrain'))
  await writeJson(join(testDir, '.contentrain', 'config.json'), {
    version: 1,
    stack: 'other',
    workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en'] },
    domains: ['site'],
  })
  await writeJson(join(testDir, MODEL_PATH), model(false))
  await writeJson(join(testDir, CONTENT_PATH), {
    e1: { question: 'What is it?', answer: 'A CMS.' },
  })
  await git.add('.')
  await git.commit('initial commit')
  defaultBranch = (await git.raw(['branch', '--show-current'])).trim()
  await ensureContentBranch(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

/**
 * Produce the collabers shape: contentrain moves with a content edit (via a
 * throwaway worktree), the base branch moves with a model migration plus a
 * source-code change — real divergence, no fast-forward possible.
 */
async function diverge(): Promise<void> {
  const git = simpleGit(testDir)

  // contentrain side: an editor kept writing content.
  const wt = join(tmpdir(), `cr-reconcile-wt-${Date.now()}`)
  await git.raw(['worktree', 'add', wt, CONTENTRAIN_BRANCH])
  const wtGit = simpleGit(wt)
  await wtGit.addConfig('user.name', 'Editor')
  await wtGit.addConfig('user.email', 'editor@test.com')
  await writeJson(join(wt, CONTENT_PATH), {
    e1: { question: 'What is it?', answer: 'A git-native CMS.' },
    e2: { question: 'New from the editor?', answer: 'Yes.' },
  })
  await wtGit.add('.')
  await wtGit.commit('[contentrain] content: faq [en]')
  await git.raw(['worktree', 'remove', wt, '--force'])

  // base side: the migration PR landed — model gains title_field, plus an
  // unrelated source file the content planner must never touch.
  await writeJson(join(testDir, MODEL_PATH), model(true))
  await ensureDir(join(testDir, 'src'))
  await writeFile(join(testDir, 'src', 'app.ts'), 'export const version = 3\n')
  await git.add('.')
  await git.commit('chore: contentrain 3 migration')
}

describe('reconcileBranches', () => {
  it('dry-run previews the plan without touching any ref', async () => {
    await diverge()
    const git = simpleGit(testDir)
    const before = {
      contentrain: (await git.raw(['rev-parse', CONTENTRAIN_BRANCH])).trim(),
      base: (await git.raw(['rev-parse', defaultBranch])).trim(),
    }

    const result = await reconcileBranches(testDir, { dryRun: true })

    expect(result.action).toBe('preview')
    expect(result.plan.conflicts).toEqual([])
    expect(result.plan.changes.map(c => c.path)).toContain(MODEL_PATH)

    expect((await git.raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()).toBe(before.contentrain)
    expect((await git.raw(['rev-parse', defaultBranch])).trim()).toBe(before.base)
  })

  it('applies as a two-parent merge commit, advances the base, keeps source intact', async () => {
    await diverge()
    const git = simpleGit(testDir)
    const oursTip = (await git.raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()
    const theirsTip = (await git.raw(['rev-parse', defaultBranch])).trim()

    const result = await reconcileBranches(testDir, { dryRun: false })

    expect(result.action).toBe('reconciled')
    expect(result.base_advance).toBe('advanced')

    // A true merge commit joining both histories.
    const parents = (await git.raw(['log', '-1', '--format=%P', CONTENTRAIN_BRANCH])).trim().split(' ')
    expect(parents.toSorted()).toEqual([oursTip, theirsTip].toSorted())

    // Base fast-forwarded to the merge commit.
    expect((await git.raw(['rev-parse', defaultBranch])).trim()).toBe(result.commit)

    // Content-aware result: editor's entries + migrated model + untouched source.
    const content = JSON.parse(await git.show([`${defaultBranch}:${CONTENT_PATH}`]))
    expect(content.e1.answer).toBe('A git-native CMS.')
    expect(content.e2).toBeDefined()
    const migrated = JSON.parse(await git.show([`${defaultBranch}:${MODEL_PATH}`]))
    expect(migrated.title_field).toBe('question')
    expect(await git.show([`${defaultBranch}:src/app.ts`])).toContain('version = 3')

    // context.json regenerated on the merge commit.
    const ctx = await git.show([`${defaultBranch}:.contentrain/context.json`])
    expect(ctx).toContain('contentrain_reconcile')
  })

  it('is idempotent: a second run reports in_sync', async () => {
    await diverge()
    await reconcileBranches(testDir, { dryRun: false })
    const second = await reconcileBranches(testDir, { dryRun: false })
    expect(second.action).toBe('in_sync')
  })

  it('returns conflicts without writing when the policy cannot decide', async () => {
    const git = simpleGit(testDir)
    // Same entry field edited differently on both sides.
    const wt = join(tmpdir(), `cr-reconcile-wt2-${Date.now()}`)
    await git.raw(['worktree', 'add', wt, CONTENTRAIN_BRANCH])
    const wtGit = simpleGit(wt)
    await wtGit.addConfig('user.name', 'Editor')
    await wtGit.addConfig('user.email', 'editor@test.com')
    await writeJson(join(wt, CONTENT_PATH), { e1: { question: 'What is it?', answer: 'Ours.' } })
    await wtGit.add('.')
    await wtGit.commit('[contentrain] ours edit')
    await git.raw(['worktree', 'remove', wt, '--force'])

    await writeJson(join(testDir, CONTENT_PATH), { e1: { question: 'What is it?', answer: 'Theirs.' } })
    await git.add('.')
    await git.commit('theirs edit on base')

    const before = (await git.raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()
    const result = await reconcileBranches(testDir, { dryRun: false })

    expect(result.action).toBe('conflicts')
    expect(result.plan.conflicts).toHaveLength(1)
    expect((await git.raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()).toBe(before)

    // Second round with the decision applies cleanly.
    const resolved = await reconcileBranches(testDir, {
      dryRun: false,
      resolutions: [{ id: result.plan.conflicts[0]!.id, choose: 'theirs' }],
    })
    expect(resolved.action).toBe('reconciled')
    const content = JSON.parse(await git.show([`${CONTENTRAIN_BRANCH}:${CONTENT_PATH}`]))
    expect(content.e1.answer).toBe('Theirs.')
  })

  it('fast-forwards a merely-behind base instead of inventing a merge', async () => {
    // Advance contentrain only (content write via worktree).
    const git = simpleGit(testDir)
    const wt = join(tmpdir(), `cr-reconcile-wt3-${Date.now()}`)
    await git.raw(['worktree', 'add', wt, CONTENTRAIN_BRANCH])
    const wtGit = simpleGit(wt)
    await wtGit.addConfig('user.name', 'Editor')
    await wtGit.addConfig('user.email', 'editor@test.com')
    await writeJson(join(wt, CONTENT_PATH), { e1: { question: 'What is it?', answer: 'Ahead.' } })
    await wtGit.add('.')
    await wtGit.commit('[contentrain] ahead')
    await git.raw(['worktree', 'remove', wt, '--force'])

    const result = await reconcileBranches(testDir, { dryRun: false })
    expect(result.action).toBe('reconciled')
    expect(result.base_advance).toBe('advanced')
    const baseTip = (await git.raw(['rev-parse', defaultBranch])).trim()
    const contentrainTip = (await git.raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()
    expect(baseTip).toBe(contentrainTip)
    // No merge commit was needed — plain fast-forward.
    const parents = (await git.raw(['log', '-1', '--format=%P', defaultBranch])).trim().split(' ')
    expect(parents).toHaveLength(1)
  })
})
