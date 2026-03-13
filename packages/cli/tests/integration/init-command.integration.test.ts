import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { pathExists } from '@contentrain/mcp/util/fs'

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}))

let testDir: string

async function initWorkspace(dir: string): Promise<void> {
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'cli-init-test',
    dependencies: { next: '^15.0.0' },
  }, null, 2))
}

async function initGitRepo(dir: string): Promise<void> {
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await git.add('.')
  await git.commit('initial')
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-cli-init-command-'))
  await initWorkspace(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('contentrain init command', { sequential: true }, () => {
  it('should initialize successfully in a fresh non-git project', async () => {
    const mod = await import('../../src/commands/init.js')
    await expect(mod.default.run?.({ args: { root: testDir, yes: true } })).resolves.toBeUndefined()

    expect(await pathExists(join(testDir, '.contentrain', 'config.json'))).toBe(true)
  })

  it('should keep the repository clean after init completes', async () => {
    await initGitRepo(testDir)

    const mod = await import('../../src/commands/init.js')
    await mod.default.run?.({ args: { root: testDir, yes: true } })

    const git = simpleGit(testDir)
    const status = await git.status()

    expect(await pathExists(join(testDir, '.contentrain', 'config.json'))).toBe(true)
    expect(status.files).toHaveLength(0)
  })

  it('should install project-level AI rules during init', async () => {
    await initGitRepo(testDir)

    const mod = await import('../../src/commands/init.js')
    await mod.default.run?.({ args: { root: testDir, yes: true } })

    expect(
      await pathExists(join(testDir, 'CLAUDE.md')) || await pathExists(join(testDir, '.cursorrules')),
    ).toBe(true)
  })

  it('should add the generated client directory to .gitignore by default', async () => {
    await initGitRepo(testDir)

    const mod = await import('../../src/commands/init.js')
    await mod.default.run?.({ args: { root: testDir, yes: true } })

    const gitignore = await readFile(join(testDir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.contentrain/client/')
  })
})
