import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Real git; contends with the other git suites.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveInitDefaultBranch } from '../../src/git/base-branch.js'
import { createGit } from '../../src/git/identity.js'
import { addBareRemote } from '../fixtures/bare-remote.js'
import { cloneTemplate, createClient, initGitRepo, parseResult } from '../support/project.js'

/**
 * #230 — `init` records the default branch as `repository.default_branch`, so
 * later writes stop depending on inference. Recorded with the base-branch
 * resolver's precedence, minus the per-process env override, and never a
 * branch that may only be where the developer happens to be.
 */

const savedEnv = process.env['CONTENTRAIN_BRANCH']
let template: string

beforeAll(async () => {
  // One committed repo on `main`; each case takes a file copy and shapes its refs.
  template = await mkdtemp(join(tmpdir(), 'cr-init-default-'))
  await initGitRepo(template)
  await createGit(template).raw(['branch', '-M', 'main'])
})

afterAll(async () => {
  await rm(template, { recursive: true, force: true })
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env['CONTENTRAIN_BRANCH']
  else process.env['CONTENTRAIN_BRANCH'] = savedEnv
})

describe('resolveInitDefaultBranch', () => {
  let dir: string
  const cleanup: string[] = []

  beforeEach(async () => {
    delete process.env['CONTENTRAIN_BRANCH']
    dir = await cloneTemplate(template)
    cleanup.push(dir)
  })

  afterAll(async () => {
    await Promise.all(cleanup.map(d => rm(d, { recursive: true, force: true })))
  })

  it('main', async () => {
    expect(await resolveInitDefaultBranch(createGit(dir))).toBe('main')
  })

  it('master', async () => {
    await createGit(dir).raw(['branch', '-m', 'main', 'master'])
    expect(await resolveInitDefaultBranch(createGit(dir))).toBe('master')
  })

  it('origin/HEAD → trunk, over a local main', async () => {
    const git = createGit(dir)
    const remote = await addBareRemote(dir)
    cleanup.push(remote)
    await git.raw(['branch', 'trunk'])
    await git.raw(['push', 'origin', 'main', 'trunk'])
    await git.raw(['remote', 'set-head', 'origin', 'trunk'])
    expect(await resolveInitDefaultBranch(git)).toBe('trunk')
  })

  it('a checked-out feature branch records the default branch, not the feature', async () => {
    await createGit(dir).raw(['checkout', '-b', 'feat/x'])
    expect(await resolveInitDefaultBranch(createGit(dir))).toBe('main')
  })

  it('the only branch, under a non-conventional name (a fresh `git init` on a develop host)', async () => {
    await createGit(dir).raw(['branch', '-m', 'main', 'develop'])
    expect(await resolveInitDefaultBranch(createGit(dir))).toBe('develop')
  })

  it('records nothing when the checked-out branch may be a feature branch', async () => {
    const git = createGit(dir)
    await git.raw(['branch', '-m', 'main', 'develop'])
    await git.raw(['checkout', '-b', 'feat/x'])
    expect(await resolveInitDefaultBranch(git)).toBeNull()
  })

  it('ignores the CONTENTRAIN_BRANCH env — a per-process override is not the project default', async () => {
    process.env['CONTENTRAIN_BRANCH'] = 'staging'
    expect(await resolveInitDefaultBranch(createGit(dir))).toBe('main')
  })
})

describe('contentrain_init writes repository.default_branch', () => {
  let dir: string

  beforeEach(async () => {
    delete process.env['CONTENTRAIN_BRANCH']
    dir = await cloneTemplate(template)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function init(): Promise<Record<string, unknown>> {
    const client = await createClient(dir)
    return parseResult(await client.callTool({ name: 'contentrain_init', arguments: { locales: ['en'] } }))
  }

  async function configOnDisk(): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(dir, '.contentrain', 'config.json'), 'utf-8')) as Record<string, unknown>
  }

  it('run on a feature branch: records main (the only field — no host is known)', async () => {
    await createGit(dir).raw(['checkout', '-b', 'feat/x'])
    const result = await init()
    expect(result['status']).toBe('committed')
    expect(result['default_branch']).toBe('main')
    // Init lands on main and contentrain, not in the feature branch's tree (#227).
    const onMain = JSON.parse(await createGit(dir).show(['main:.contentrain/config.json'])) as Record<string, unknown>
    expect(onMain['repository']).toEqual({ default_branch: 'main' })
    // The checkout itself is left where it was.
    expect((await createGit(dir).raw(['branch', '--show-current'])).trim()).toBe('feat/x')
  })

  it('re-running init leaves an existing default_branch as it is', async () => {
    await init()
    const git = createGit(dir)
    // The project's default moves on (say, main → trunk) and is recorded by hand.
    const config = await configOnDisk()
    const edited = { ...config, repository: { default_branch: 'release' } }
    await writeFile(join(dir, '.contentrain', 'config.json'), `${JSON.stringify(edited, null, 2)}\n`)
    await git.raw(['branch', '-m', 'main', 'master'])

    const again = await init()
    expect(again['error']).toBe('Already initialized')
    expect((await configOnDisk())['repository']).toEqual({ default_branch: 'release' })
  })
})
