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
 * Why this exists: a `contentrain_init` transaction spawns 33 git processes,
 * so re-running it in every `beforeEach` dominated suite wall-clock — the mcp
 * suite took over twenty minutes and timed out tests at random.
 *
 * The fix is to spawn git as few times as possible:
 *   - read-only suites build ONE fixture in `beforeAll` and share it;
 *   - mutating suites build ONE inited template in `beforeAll` and give each
 *     test an isolated copy via {@link cloneTemplate} — a recursive file copy
 *     spawns zero git processes, versus 33 for a fresh init.
 *
 * A correction, because the wrong explanation stood here for a long time and
 * sent several people looking in the wrong place: this comment used to claim
 * the cost was `fork`/`posix_spawn` work scaling with the worker's address
 * space. It does not. Measured with 1.5GB of live V8 heap, spawn cost is
 * unchanged (27.8ms against 27.9ms at 0MB), and libuv has used `posix_spawn`
 * on macOS since 1.44 — there is no page-table copy to scale with.
 *
 * The real cost was resolving `git` through PATH. Inside a vitest worker that
 * measured 198.8ms per spawn by name against 22.0ms by absolute path on a
 * 41-entry PATH; in a bare Node process the same probe is nearly free, which
 * is why it never showed up in isolation. `createGit` in
 * `src/git/identity.ts` now resolves the binary once, and
 * `tests/setup/trim-path.ts` prunes PATH entries that are not directories.
 *
 * Both fixes together took the suite from >20 minutes to ~3.
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
