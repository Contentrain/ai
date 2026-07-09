import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit, type SimpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { createServer } from '../../src/server.js'
import { addBareRemote, remoteHeads } from '../fixtures/bare-remote.js'

/**
 * Remote-lifecycle behavior of the workflow tools (contentrain_merge,
 * contentrain_branch_delete, contentrain_branch_list) against a real bare
 * remote. Deliberately separate from workflow.test.ts: that file re-inits a
 * project per test; this one shares ONE fixture per file (the known slow
 * point is init-per-test), and each test seeds its own cr/* branch with raw
 * git — mimicking what a review-mode save produces.
 */

let testDir: string
let remoteDir: string
let client: Client
let git: SimpleGit
let defaultBranch: string

async function createTestClient(projectRoot: string): Promise<Client> {
  const server = createServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const c = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([
    c.connect(clientTransport),
    server.connect(serverTransport),
  ])
  return c
}

function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

/** Create a cr/* branch with one commit from contentrain and push it. */
async function seedPushedBranch(name: string, file: string): Promise<void> {
  await git.checkoutBranch(name, CONTENTRAIN_BRANCH)
  await mkdir(join(testDir, '.contentrain', 'content', file), { recursive: true })
  await writeFile(join(testDir, '.contentrain', 'content', file, 'en.json'), `{"from":"${name}"}\n`)
  await git.add('.')
  await git.commit(`[contentrain] content: ${file}`)
  await git.checkout(defaultBranch)
  await git.push('origin', name)
}

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-workflow-remote-'))
  git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await mkdir(join(testDir, '.contentrain'), { recursive: true })
  await writeFile(join(testDir, '.contentrain', 'config.json'), JSON.stringify({
    version: 1,
    stack: 'other',
    workflow: 'review',
    locales: { default: 'en', supported: ['en'] },
    domains: ['test'],
  }, null, 2))
  await git.add('.')
  await git.commit('initial')
  await git.branch([CONTENTRAIN_BRANCH])
  defaultBranch = (await git.raw(['branch', '--show-current'])).trim()
  remoteDir = await addBareRemote(testDir)
  client = await createTestClient(testDir)
})

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true })
  await rm(remoteDir, { recursive: true, force: true })
})

describe('contentrain_merge (remote cleanup)', () => {
  it('deletes the pushed copy after the merge and reports it', async () => {
    await seedPushedBranch('cr/content/blog/1700000000-m1', 'blog-m1')

    const result = await client.callTool({
      name: 'contentrain_merge',
      arguments: { branch: 'cr/content/blog/1700000000-m1', confirm: true },
    })
    const data = parseResult(result)

    expect(data['status']).toBe('merged')
    const remote = data['remote'] as Record<string, unknown>
    expect(remote['deleted']).toBe(true)
    expect((await git.branchLocal()).all).not.toContain('cr/content/blog/1700000000-m1')
    expect(await remoteHeads(remoteDir)).not.toContain('cr/content/blog/1700000000-m1')
  })
})

describe('contentrain_branch_delete (remote cleanup)', () => {
  it('deletes the local branch and its remote copy', async () => {
    await seedPushedBranch('cr/content/blog/1700000000-d1', 'blog-d1')

    const result = await client.callTool({
      name: 'contentrain_branch_delete',
      arguments: { branch: 'cr/content/blog/1700000000-d1', confirm: true },
    })
    const data = parseResult(result)

    expect(data['status']).toBe('deleted')
    expect(data['remote_deleted']).toBe(true)
    expect((await git.branchLocal()).all).not.toContain('cr/content/blog/1700000000-d1')
    expect(await remoteHeads(remoteDir)).not.toContain('cr/content/blog/1700000000-d1')
  })

  it('falls back to a remote-only delete when the local copy is gone', async () => {
    await seedPushedBranch('cr/content/blog/1700000000-d2', 'blog-d2')
    await git.raw(['branch', '-D', 'cr/content/blog/1700000000-d2'])

    const result = await client.callTool({
      name: 'contentrain_branch_delete',
      arguments: { branch: 'cr/content/blog/1700000000-d2', confirm: true },
    })
    const data = parseResult(result)

    expect(data['status']).toBe('deleted')
    expect(data['scope']).toBe('remote-only')
    expect(await remoteHeads(remoteDir)).not.toContain('cr/content/blog/1700000000-d2')
  })

  it('still errors when the branch exists nowhere', async () => {
    const result = await client.callTool({
      name: 'contentrain_branch_delete',
      arguments: { branch: 'cr/content/ghost/1700000000-x', confirm: true },
    })
    const data = parseResult(result)

    expect(data['error']).toContain('not found locally or on the remote')
  })
})

describe('contentrain_branch_list (remote view)', () => {
  it('annotates entries with on_remote and reports remote-only leftovers', async () => {
    await seedPushedBranch('cr/content/blog/1700000000-l1', 'blog-l1')
    await seedPushedBranch('cr/content/blog/1700000000-l2', 'blog-l2')
    await git.raw(['branch', '-D', 'cr/content/blog/1700000000-l2'])

    const result = await client.callTool({
      name: 'contentrain_branch_list',
      arguments: { remote: true },
    })
    const data = parseResult(result)

    const branches = data['branches'] as Array<Record<string, unknown>>
    const l1 = branches.find(b => b['name'] === 'cr/content/blog/1700000000-l1')
    expect(l1).toBeDefined()
    expect(l1!['on_remote']).toBe(true)
    expect(data['remote_only']).toContain('cr/content/blog/1700000000-l2')
  })

  it('omits remote fields when remote is not requested', async () => {
    const result = await client.callTool({ name: 'contentrain_branch_list', arguments: {} })
    const data = parseResult(result)

    expect(data['remote_only']).toBeUndefined()
    expect(data['remote_error']).toBeUndefined()
  })
})
