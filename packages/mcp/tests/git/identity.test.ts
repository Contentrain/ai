import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { authorConfig, NETWORK_UNSAFE } from '../../src/git/identity.js'

/**
 * Regression coverage for the simple-git block-unsafe guard.
 *
 * simple-git >= 3.34 (`@simple-git/argv-parser`) rejects a `git` invocation
 * when a guard-listed variable (EDITOR, GIT_ASKPASS, …) is passed EXPLICITLY
 * through `.env()`. The previous code spread `process.env` into `.env()` to set
 * the commit author, which tripped the guard in any host (VS Code, Claude Code,
 * CI) that exports those variables. These tests pin the fix: identity via
 * `-c user.*` config, and network instances opt out of the guard categories.
 */

const TOUCHED = [
  'EDITOR',
  'GIT_ASKPASS',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'CONTENTRAIN_AUTHOR_NAME',
  'CONTENTRAIN_AUTHOR_EMAIL',
] as const

let repo: string
const saved: Record<string, string | undefined> = {}

beforeEach(async () => {
  for (const key of TOUCHED) saved[key] = process.env[key]

  // Simulate a host that exports guard-tripping variables (the real-world bug).
  process.env['EDITOR'] = 'vi'
  process.env['GIT_ASKPASS'] = '/usr/bin/true'
  // Identity must come from our `-c` config, not ambient GIT_AUTHOR_*/defaults.
  for (const key of TOUCHED.slice(2)) delete process.env[key]

  repo = await mkdtemp(join(tmpdir(), 'cr-identity-'))
  const git = simpleGit(repo)
  await git.init()
  await writeFile(join(repo, 'a.txt'), 'hello\n')
})

afterEach(async () => {
  for (const key of TOUCHED) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  await rm(repo, { recursive: true, force: true })
})

describe('git identity — block-unsafe guard', () => {
  it('commits via `-c user.*` config while EDITOR/GIT_ASKPASS are set (guard not tripped)', async () => {
    const git = simpleGit(repo, { config: authorConfig() })
    await git.add('.')
    await git.commit('add a')

    const author = (await git.raw(['log', '-1', '--format=%an <%ae>'])).trim()
    const committer = (await git.raw(['log', '-1', '--format=%cn <%ce>'])).trim()
    expect(author).toBe('Contentrain <ai@contentrain.io>')
    // `user.*` config sets committer identity too, matching the old env behavior.
    expect(committer).toBe('Contentrain <ai@contentrain.io>')
  })

  it('honors CONTENTRAIN_AUTHOR_* overrides through the config path', async () => {
    process.env['CONTENTRAIN_AUTHOR_NAME'] = 'Ada'
    process.env['CONTENTRAIN_AUTHOR_EMAIL'] = 'ada@example.com'
    const git = simpleGit(repo, { config: authorConfig() })
    await git.add('.')
    await git.commit('add a')

    const author = (await git.raw(['log', '-1', '--format=%an <%ae>'])).trim()
    expect(author).toBe('Ada <ada@example.com>')
  })

  it('control: spreading process.env into `.env()` trips the guard (the original bug)', async () => {
    const git = simpleGit(repo).env({ ...process.env })
    await expect(git.raw(['status'])).rejects.toThrow(/not permitted/i)
  })

  it('networkGit-style instance runs despite inherited env via NETWORK_UNSAFE', async () => {
    const git = simpleGit({ baseDir: repo, unsafe: NETWORK_UNSAFE })
      .env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
    const status = await git.raw(['status', '--porcelain'])
    expect(status).toContain('a.txt')
  })

  it('control: the same inherited-env instance without NETWORK_UNSAFE trips the guard', async () => {
    const git = simpleGit({ baseDir: repo }).env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
    await expect(git.raw(['status'])).rejects.toThrow(/not permitted/i)
  })
})
