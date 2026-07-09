import { cp, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'

/**
 * Shared test-support for the MCP write-path suites.
 *
 * Why this exists: on macOS every `git` subprocess spawned from inside a
 * loaded vitest worker costs ~150ms (≈14× the standalone cost) because the
 * fork/posix_spawn work scales with the worker's address space — not with
 * git itself, whose own runtime per command is ~1–20ms. A single
 * `contentrain_init` transaction spawns ~28 git processes, so re-running it
 * in every `beforeEach` dominates suite wall-clock.
 *
 * The fix is to spawn git as few times as possible:
 *   - read-only suites build ONE fixture in `beforeAll` and share it;
 *   - mutating suites build ONE inited template in `beforeAll` and give each
 *     test an isolated copy via {@link cloneTemplate} — a recursive file copy
 *     spawns zero git processes, versus ~28 for a fresh init.
 */

/** Build an MCP client wired to a fresh in-memory server over the given root. */
export async function createClient(projectRoot: string): Promise<Client> {
  const server = createServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ])
  return client
}

/** Parse the JSON payload out of a tool result's first text content block. */
export function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

/** git init + identity + one empty commit. The minimal committable repo. */
export async function initGitRepo(dir: string): Promise<void> {
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await git.commit('initial', { '--allow-empty': null, '--no-verify': null })
}

/**
 * Create a temp git repo and run `contentrain_init` once, returning the path.
 * Call this in `beforeAll`; hand each test a private copy with
 * {@link cloneTemplate}. `prepare` runs after the repo is committed but
 * before init — use it to lay down source files that must exist at init time.
 */
export async function makeInitedTemplate(opts?: {
  locales?: string[]
  prepare?: (dir: string) => Promise<void>
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cr-template-'))
  await initGitRepo(dir)
  if (opts?.prepare) {
    await opts.prepare(dir)
    const git = simpleGit(dir)
    await git.add('.')
    await git.commit('fixture sources', { '--no-verify': null })
  }
  const client = await createClient(dir)
  await client.callTool({
    name: 'contentrain_init',
    arguments: opts?.locales ? { locales: opts.locales } : {},
  })
  return dir
}

/**
 * Copy an inited template into a fresh temp dir — an isolated, ready-to-use
 * project with zero git subprocesses. The `.git` directory copies as plain
 * files; the template leaves no worktrees behind, so the copy is a fully
 * functional repo at its new path.
 */
export async function cloneTemplate(template: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cr-clone-'))
  await cp(template, dir, { recursive: true })
  return dir
}
