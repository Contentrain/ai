import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { writeJson, pathExists } from '@contentrain/mcp/util/fs'
import type { ContentrainConfig, ModelDefinition } from '@contentrain/types'

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })

const selectMock = vi.fn()
const successMock = vi.fn()
const warningMock = vi.fn()

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: successMock, error: vi.fn(), warning: warningMock, info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: selectMock,
  isCancel: vi.fn().mockReturnValue(false),
}))

let testDir: string

async function initGitRepo(dir: string): Promise<void> {
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'cli-validate-test' }, null, 2))
  await git.add('.')
  await git.commit('initial')
}

async function seedProject(dir: string): Promise<void> {
  const crDir = join(dir, '.contentrain')
  await writeFile(join(dir, '.gitignore'), '.contentrain/.cache/\n')
  await writeJson(join(crDir, 'config.json'), {
    version: 1,
    stack: 'next',
    workflow: 'review',
    locales: { default: 'en', supported: ['en', 'tr'] },
    domains: ['marketing'],
  } satisfies ContentrainConfig)
  await writeJson(join(crDir, 'vocabulary.json'), { version: 1, terms: {} })
  await writeJson(join(crDir, 'context.json'), {
    version: '1',
    lastOperation: {
      tool: 'contentrain_init',
      model: '',
      locale: 'en',
      timestamp: new Date().toISOString(),
      source: 'mcp-local',
    },
    stats: { models: 1, entries: 1, locales: ['en', 'tr'], lastSync: new Date().toISOString() },
  })

  const model: ModelDefinition = {
    id: 'authors',
    name: 'Authors',
    kind: 'collection',
    domain: 'marketing',
    i18n: true,
    fields: {
      title: { type: 'string', required: true },
    },
  }

  await writeJson(join(crDir, 'models', 'authors.json'), model)
  await writeJson(join(crDir, 'content', 'marketing', 'authors', 'en.json'), {
    alice: { title: 'Alice' },
  })
}

async function createActiveContentrainBranches(dir: string, count: number): Promise<void> {
  const git = simpleGit(dir)
  const baseBranch = (await git.raw(['branch', '--show-current'])).trim() || 'main'

  await git.checkoutLocalBranch('contentrain-source')
  await git.commit('contentrain saturation source', { '--allow-empty': null })
  const sourceHead = (await git.revparse(['HEAD'])).trim()
  await git.checkout(baseBranch)

  // Batch-create all branches in a single git process via update-ref --stdin
  const input = Array.from({ length: count }, (_, i) =>
    `create refs/heads/cr/review/test-${i} ${sourceHead}`,
  ).join('\n') + '\n'
  spawnSync('git', ['update-ref', '--stdin', '--no-deref'], { input, cwd: dir })

  await git.deleteLocalBranch('contentrain-source', true)
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-cli-validate-'))
  await initGitRepo(testDir)
  await seedProject(testDir)
  const git = simpleGit(testDir)
  await git.add('.')
  await git.commit('seed contentrain project')
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('contentrain validate --fix', { sequential: true }, () => {
  it('should keep fixes on the review branch instead of mutating the base worktree directly', async () => {
    const mod = await import('../../src/commands/validate.js')
    await mod.default.run?.({ args: { root: testDir, fix: true } })

    const git = simpleGit(testDir)
    const status = await git.status()
    const branches = await git.branch()

    expect(await pathExists(join(testDir, '.contentrain', 'content', 'marketing', 'authors', 'tr.json'))).toBe(false)
    expect(status.files).toHaveLength(0)
    expect(branches.all.some(b => b.startsWith('cr/fix/validate/'))).toBe(true)
  })

  it('should not report remaining errors from the untouched base worktree after interactive fix on review workflow', async () => {
    selectMock.mockResolvedValueOnce('fix-all')

    const mod = await import('../../src/commands/validate.js')
    await mod.default.run?.({ args: { root: testDir, interactive: true } })

    const git = simpleGit(testDir)
    const branches = await git.branch()

    expect(branches.all.some(b => b.startsWith('cr/fix/validate/'))).toBe(true)
    expect(warningMock).not.toHaveBeenCalledWith(expect.stringContaining('remaining'))
    expect(successMock).toHaveBeenCalled()
  })

  it('should block auto-fix when 80 active contentrain branches already exist', async () => {
    await createActiveContentrainBranches(testDir, 80)
    process.exitCode = undefined

    const mod = await import('../../src/commands/validate.js')
    await expect(mod.default.run?.({ args: { root: testDir, fix: true } })).resolves.toBeUndefined()
    expect(process.exitCode).toBe(1)
  })
})
