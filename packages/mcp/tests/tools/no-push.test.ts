import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { createGit } from '../../src/git/identity.js'
import { LOCAL_MODE_NOTE } from '../../src/git/push-policy.js'
import { readJson, writeJson } from '../../src/util/fs.js'
import { cloneTemplate, createClient, makeInitedTemplate, parseResult } from '../support/project.js'
import { addCountingRemote, remoteHeads, type CountingRemote } from '../fixtures/bare-remote.js'

/**
 * Local mode at the tool layer: every write reports "not pushed (local
 * mode)" instead of a silent success, contentrain_submit refuses, and the
 * branch tools never touch the remote. The counting remote is the witness.
 */

let template: string
let testDir: string
let remote: CountingRemote
let client: Client

async function setLocalMode(): Promise<void> {
  const path = join(testDir, '.contentrain', 'config.json')
  const config = await readJson<Record<string, unknown>>(path)
  await writeJson(path, { ...config, git: { push: false } })
  client = await createClient(testDir)
}

/** A cr/* branch with one commit, pushed while pushing is still on. */
async function seedPushedBranch(name: string): Promise<void> {
  const git = createGit(testDir)
  const base = (await git.raw(['branch', '--show-current'])).trim()
  await git.checkoutBranch(name, CONTENTRAIN_BRANCH)
  await mkdir(join(testDir, '.contentrain', 'content', 'seed'), { recursive: true })
  await writeFile(join(testDir, '.contentrain', 'content', 'seed', 'en.json'), `{"from":"${name}"}\n`)
  await git.add('.')
  await git.commit('[contentrain] content: seed')
  await git.checkout(base)
  await git.push('origin', name)
}

beforeAll(async () => {
  template = await makeInitedTemplate({ locales: ['en'] })
})

afterAll(async () => {
  await rm(template, { recursive: true, force: true })
})

beforeEach(async () => {
  testDir = await cloneTemplate(template)
  remote = await addCountingRemote(testDir)
  client = await createClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
  await rm(remote.dir, { recursive: true, force: true })
})

describe('local mode at the tool layer', () => {
  it('a write says it was not pushed, and pushes nothing', async () => {
    await setLocalMode()

    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: { id: 'notes', name: 'Notes', kind: 'collection', domain: 'blog', i18n: true, title_field: 'title', fields: { title: { type: 'string' } } },
    })
    const data = parseResult(result)

    expect(result.isError).toBeFalsy()
    const git = data['git'] as Record<string, unknown>
    expect(git['remote_push']).toBe('disabled')
    expect(git['remote_note']).toBe(LOCAL_MODE_NOTE)
    expect((data['next_steps'] as string[]).some(s => s.startsWith('LOCAL MODE'))).toBe(true)
    expect(await remote.pushes()).toBe(0)
  })

  it('contentrain_submit refuses instead of reporting success', async () => {
    await seedPushedBranch('cr/content/seed/1700000000-s1')
    await setLocalMode()
    await remote.reset()

    const result = await client.callTool({ name: 'contentrain_submit', arguments: {} })
    const data = parseResult(result)

    expect(result.isError).toBe(true)
    expect(data['error']).toContain('Nothing was pushed')
    expect(data['error']).toContain('git.push: false')
    expect(data['remote_push']).toBe('disabled')
    expect(data['pending_branches']).toContain('cr/content/seed/1700000000-s1')
    expect(await remote.pushes()).toBe(0)
  })

  it('contentrain_merge merges locally and notes the remote was left alone', async () => {
    const branch = 'cr/content/seed/1700000000-m1'
    await seedPushedBranch(branch)
    await setLocalMode()
    await remote.reset()

    const data = parseResult(await client.callTool({ name: 'contentrain_merge', arguments: { branch, confirm: true } }))

    expect(data['status']).toBe('merged')
    expect(data['remote_push']).toBe('disabled')
    expect(data['remote_note']).toBe(LOCAL_MODE_NOTE)
    expect((await createGit(testDir).branchLocal()).all).not.toContain(branch)
    expect(await remoteHeads(remote.dir)).toContain(branch)
    expect(await remote.pushes()).toBe(0)
  })

  it('contentrain_branch_delete deletes the local branch fully and skips the remote delete', async () => {
    const branch = 'cr/content/seed/1700000000-d1'
    await seedPushedBranch(branch)
    await setLocalMode()
    await remote.reset()

    const data = parseResult(await client.callTool({ name: 'contentrain_branch_delete', arguments: { branch, confirm: true } }))

    expect(data['status']).toBe('deleted')
    expect(data['remote_deleted']).toBe(false)
    expect(data['remote_skipped']).toBe('local-mode')
    expect(String(data['remote_note'])).toContain(LOCAL_MODE_NOTE)
    // Not half-deleted: no local ref, no leftover worktree; the remote copy stays.
    const git = createGit(testDir)
    expect((await git.branchLocal()).all).not.toContain(branch)
    expect(await git.raw(['for-each-ref', `refs/heads/${branch}`])).toBe('')
    expect(await git.raw(['worktree', 'list'])).not.toContain(branch)
    expect(await remoteHeads(remote.dir)).toContain(branch)
    expect(await remote.pushes()).toBe(0)
  })

  it('contentrain_branch_delete of a local-gone branch does not reach for the remote', async () => {
    const branch = 'cr/content/seed/1700000000-d2'
    await seedPushedBranch(branch)
    await createGit(testDir).raw(['branch', '-D', branch])
    await setLocalMode()
    await remote.reset()

    const result = await client.callTool({ name: 'contentrain_branch_delete', arguments: { branch, confirm: true } })
    const data = parseResult(result)

    expect(result.isError).toBe(true)
    expect(data['remote_skipped']).toBe('local-mode')
    expect(await remoteHeads(remote.dir)).toContain(branch)
    expect(await remote.pushes()).toBe(0)
  })
})

describe('local mode off at the tool layer', () => {
  it('a write pushes and carries no local-mode note', async () => {
    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: { id: 'notes', name: 'Notes', kind: 'collection', domain: 'blog', i18n: true, title_field: 'title', fields: { title: { type: 'string' } } },
    })
    const git = parseResult(result)['git'] as Record<string, unknown>

    expect(git['remote_push']).toBe('pushed')
    expect(git['remote_note']).toBeUndefined()
    expect(await remote.pushes()).toBeGreaterThan(0)
  })
})
