import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

// Real git against a bare remote; contends with the other git suites.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { resolveBaseBranch } from '../../src/git/base-branch.js'
import { createGit } from '../../src/git/identity.js'
import { isAncestor } from '../../src/git/transaction.js'
import { addBareRemote, remoteHeads } from '../fixtures/bare-remote.js'
import { cloneTemplate, createClient, initGitRepo, makeInitedTemplate, parseResult } from '../support/project.js'

/**
 * #227 — the base branch of a local write is the project's default branch,
 * never "whatever is checked out". With the checked-out branch as the
 * fallback, a content write run on a feature branch merged the feature's code
 * into `contentrain`, advanced and pushed the feature branch, and the code
 * reached the default branch on the next write by anyone.
 */

describe('resolveBaseBranch', () => {
  let dir: string
  const savedEnv = process.env['CONTENTRAIN_BRANCH']

  beforeEach(async () => {
    delete process.env['CONTENTRAIN_BRANCH']
    dir = await mkdtemp(join(tmpdir(), 'cr-base-branch-'))
    await initGitRepo(dir)
    const git = createGit(dir)
    // Normalise the initial branch name — `git init` follows the host's
    // init.defaultBranch — then check out a feature branch.
    await git.raw(['branch', '-M', 'main'])
    await git.raw(['checkout', '-b', 'feat/x'])
  })

  afterEach(async () => {
    if (savedEnv === undefined) delete process.env['CONTENTRAIN_BRANCH']
    else process.env['CONTENTRAIN_BRANCH'] = savedEnv
    await rm(dir, { recursive: true, force: true })
  })

  it('ignores the checked-out feature branch and picks main', async () => {
    expect(await resolveBaseBranch(createGit(dir), null)).toBe('main')
  })

  it('falls back to master when there is no main', async () => {
    await createGit(dir).raw(['branch', '-m', 'main', 'master'])
    expect(await resolveBaseBranch(createGit(dir), null)).toBe('master')
  })

  it('prefers the remote default branch when it exists locally', async () => {
    const git = createGit(dir)
    await git.raw(['branch', 'trunk'])
    await git.raw(['update-ref', 'refs/remotes/origin/trunk', 'trunk'])
    await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'])
    expect(await resolveBaseBranch(git, null)).toBe('trunk')
  })

  it('config default_branch beats inference, and the env beats config', async () => {
    const config = { repository: { provider: 'github', owner: 'o', name: 'n', default_branch: 'release' } } as never
    expect(await resolveBaseBranch(createGit(dir), config)).toBe('release')
    process.env['CONTENTRAIN_BRANCH'] = 'staging'
    expect(await resolveBaseBranch(createGit(dir), config)).toBe('staging')
  })

  it('uses the checked-out branch only when no conventional base exists', async () => {
    await createGit(dir).raw(['branch', '-D', 'main'])
    expect(await resolveBaseBranch(createGit(dir), null)).toBe('feat/x')
  })
})

describe('local content write while a feature branch is checked out (#227)', () => {
  let template: string
  let work: string
  let remote: string
  let baseBranch: string
  let client: Client

  beforeAll(async () => {
    template = await makeInitedTemplate({ locales: ['en'] })
    const setup = await createClient(template)
    await setup.callTool({
      name: 'contentrain_model_save',
      arguments: { id: 'ui-strings', name: 'UI Strings', kind: 'dictionary', domain: 'test', i18n: true, title_field: 'key' },
    })
  })

  afterAll(async () => {
    await rm(template, { recursive: true, force: true })
  })

  beforeEach(async () => {
    work = await cloneTemplate(template)
    const git = createGit(work)
    baseBranch = (await git.raw(['branch', '--show-current'])).trim()
    remote = await addBareRemote(work)
    await git.push('origin', baseBranch)
    await git.push('origin', CONTENTRAIN_BRANCH)
    // What `git clone` leaves behind: origin/HEAD names the default branch.
    await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${baseBranch}`])
    client = await createClient(work)
  })

  afterEach(async () => {
    await Promise.all([work, remote].map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('never merges feature code into contentrain, and never moves or pushes the feature branch', async () => {
    const git = createGit(work)
    await git.raw(['checkout', '-b', 'feat/x'])
    await writeFile(join(work, 'app.vue'), '<template>code-only change</template>\n', 'utf-8')
    await git.add('app.vue')
    await git.commit('feat: code-only change', { '--no-verify': null })
    const featureTip = (await git.raw(['rev-parse', 'feat/x'])).trim()
    // Something staged but not committed — must survive the write.
    await appendFile(join(work, 'app.vue'), '<!-- staged -->\n', 'utf-8')
    await git.add('app.vue')

    const result = parseResult(await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'ui-strings', entries: [{ locale: 'en', data: { 'zz.test': 'x' } }] },
    }))

    expect(result['error']).toBeUndefined()
    // The code commit is in neither contentrain nor the base branch.
    expect(await isAncestor(git, featureTip, CONTENTRAIN_BRANCH)).toBe(false)
    expect(await isAncestor(git, featureTip, baseBranch)).toBe(false)
    // The feature branch did not move and was not pushed.
    expect((await git.raw(['rev-parse', 'feat/x'])).trim()).toBe(featureTip)
    expect(await remoteHeads(remote)).not.toContain('feat/x')

    const report = result['git'] as Record<string, unknown>
    expect(report['base_advance']).toBe('advanced')
    expect(report['remote_push']).toBe('pushed')
    expect(String(result['warning'])).toContain(`"feat/x", which was not touched`)
    // The content landed on the base branch and on the remote.
    const onBase = JSON.parse(await createGit(remote).show([`${baseBranch}:.contentrain/content/test/ui-strings/en.json`])) as Record<string, string>
    expect(onBase['zz.test']).toBe('x')
    // The developer's tree and index are exactly as they left them.
    expect((await git.raw(['branch', '--show-current'])).trim()).toBe('feat/x')
    expect((await git.raw(['diff', '--cached', '--name-only'])).trim()).toBe('app.vue')
    expect(await readFile(join(work, 'app.vue'), 'utf-8')).toContain('<!-- staged -->')
  })

  it('status reports the default branch as base, not the checked-out one', async () => {
    await createGit(work).raw(['checkout', '-b', 'feat/y'])

    const status = parseResult(await client.callTool({ name: 'contentrain_status', arguments: {} }))

    expect((status['content_branch'] as Record<string, unknown>)['base']).toBe(baseBranch)
  })
})
