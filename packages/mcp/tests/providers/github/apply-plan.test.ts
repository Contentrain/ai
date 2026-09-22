import { describe, expect, it, vi } from 'vitest'
import { applyPlanToGitHub } from '../../../src/providers/github/apply-plan.js'
import type { GitHubClient } from '../../../src/providers/github/client.js'

/**
 * applyPlanToGitHub unit tests — exercise the Git Data API write flow
 * against a mocked Octokit. Validates that writes carry their content
 * inline in the tree (no per-file blob round trip), deletions emit
 * null-sha tree entries, branches are created vs. updated depending on
 * existence, and the default branch is the fallback base.
 */

interface StubShape {
  getRef?: ReturnType<typeof vi.fn>
  createRef?: ReturnType<typeof vi.fn>
  updateRef?: ReturnType<typeof vi.fn>
  getCommit?: ReturnType<typeof vi.fn>
  createCommit?: ReturnType<typeof vi.fn>
  createBlob?: ReturnType<typeof vi.fn>
  createTree?: ReturnType<typeof vi.fn>
  repoGet?: ReturnType<typeof vi.fn>
}

function mockClient(s: StubShape): GitHubClient {
  return {
    rest: {
      repos: { get: s.repoGet ?? vi.fn() },
      git: {
        getRef: s.getRef ?? vi.fn(),
        createRef: s.createRef ?? vi.fn(),
        updateRef: s.updateRef ?? vi.fn(),
        getCommit: s.getCommit ?? vi.fn(),
        createCommit: s.createCommit ?? vi.fn(),
        createBlob: s.createBlob ?? vi.fn(),
        createTree: s.createTree ?? vi.fn(),
      },
    },
  } as unknown as GitHubClient
}

const REPO = { owner: 'o', name: 'r' }
const AUTHOR = { name: 'MCP', email: 'ai@contentrain.io' }

function notFound(): Error {
  return Object.assign(new Error('Not Found'), { status: 404 })
}

describe('applyPlanToGitHub', () => {
  it('updates an existing branch with a new commit', async () => {
    const getRef = vi.fn().mockResolvedValueOnce({ data: { object: { sha: 'base-sha' } } })
    const getCommit = vi.fn().mockResolvedValue({ data: { tree: { sha: 'base-tree' } } })
    const createBlob = vi.fn().mockResolvedValue({ data: { sha: 'new-blob' } })
    const createTree = vi.fn().mockResolvedValue({ data: { sha: 'new-tree' } })
    const createCommit = vi.fn().mockResolvedValue({
      data: {
        sha: 'new-commit',
        message: 'test',
        author: { name: 'MCP', email: 'ai@contentrain.io', date: '2026-01-01T00:00:00Z' },
      },
    })
    const updateRef = vi.fn().mockResolvedValue({})

    const client = mockClient({ getRef, getCommit, createBlob, createTree, createCommit, updateRef })
    const commit = await applyPlanToGitHub(client, REPO, {
      branch: 'cr/test',
      changes: [{ path: '.contentrain/config.json', content: '{}' }],
      message: 'test',
      author: AUTHOR,
    })

    expect(commit.sha).toBe('new-commit')
    expect(updateRef).toHaveBeenCalledWith({ owner: 'o', repo: 'r', ref: 'heads/cr/test', sha: 'new-commit' })
    // Content is inlined into the tree entry — no per-file blob POST.
    expect(createBlob).not.toHaveBeenCalled()
    const treeArg = createTree.mock.calls[0]![0].tree
    expect(treeArg).toEqual([
      { path: '.contentrain/config.json', mode: '100644', type: 'blob', content: '{}' },
    ])
  })

  it('creates a branch from input.base when the target does not exist', async () => {
    const getRef = vi.fn()
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce({ data: { object: { sha: 'main-sha' } } })
    const getCommit = vi.fn().mockResolvedValue({ data: { tree: { sha: 'main-tree' } } })
    const createBlob = vi.fn().mockResolvedValue({ data: { sha: 'b' } })
    const createTree = vi.fn().mockResolvedValue({ data: { sha: 't' } })
    const createCommit = vi.fn().mockResolvedValue({
      data: {
        sha: 'c',
        message: 'test',
        author: { name: 'MCP', email: 'ai@contentrain.io', date: '2026-01-01T00:00:00Z' },
      },
    })
    const createRef = vi.fn().mockResolvedValue({})

    const client = mockClient({ getRef, getCommit, createBlob, createTree, createCommit, createRef })
    await applyPlanToGitHub(client, REPO, {
      branch: 'cr/new',
      changes: [{ path: 'a.json', content: '{}' }],
      message: 'new',
      author: AUTHOR,
      base: 'main',
    })

    expect(createRef).toHaveBeenCalledWith({ owner: 'o', repo: 'r', ref: 'refs/heads/cr/new', sha: 'c' })
    expect(getRef).toHaveBeenNthCalledWith(1, { owner: 'o', repo: 'r', ref: 'heads/cr/new' })
    expect(getRef).toHaveBeenNthCalledWith(2, { owner: 'o', repo: 'r', ref: 'heads/main' })
  })

  it('defaults to the contentrain branch when no base is provided', async () => {
    // Invariant: feature branches always fork from the content-tracking
    // branch, never from the repo's default branch. Asserting against
    // `heads/contentrain` and that `repos.get` is NOT called locks this
    // in for both the GitHub implementation and the public contract
    // documented on ApplyPlanInput.base.
    const getRef = vi.fn()
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce({ data: { object: { sha: 'contentrain-sha' } } })
    const repoGet = vi.fn().mockResolvedValue({ data: { default_branch: 'main' } })
    const getCommit = vi.fn().mockResolvedValue({ data: { tree: { sha: 't' } } })
    const createBlob = vi.fn().mockResolvedValue({ data: { sha: 'b' } })
    const createTree = vi.fn().mockResolvedValue({ data: { sha: 'tt' } })
    const createCommit = vi.fn().mockResolvedValue({
      data: {
        sha: 'c',
        message: 'm',
        author: { name: 'MCP', email: 'ai@contentrain.io', date: '2026-01-01T00:00:00Z' },
      },
    })
    const createRef = vi.fn().mockResolvedValue({})

    const client = mockClient({ getRef, repoGet, getCommit, createBlob, createTree, createCommit, createRef })
    await applyPlanToGitHub(client, REPO, {
      branch: 'cr/new',
      changes: [{ path: 'a.json', content: '{}' }],
      message: 'm',
      author: AUTHOR,
    })

    expect(repoGet).not.toHaveBeenCalled()
    expect(getRef).toHaveBeenNthCalledWith(2, { owner: 'o', repo: 'r', ref: 'heads/contentrain' })
  })

  it('emits null-sha tree entries for deletions', async () => {
    const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: 'base' } } })
    const getCommit = vi.fn().mockResolvedValue({ data: { tree: { sha: 'bt' } } })
    const createBlob = vi.fn().mockResolvedValue({ data: { sha: 'b' } })
    const createTree = vi.fn().mockResolvedValue({ data: { sha: 't' } })
    const createCommit = vi.fn().mockResolvedValue({
      data: {
        sha: 'c',
        message: 'm',
        author: { name: 'MCP', email: 'ai@contentrain.io', date: '2026-01-01T00:00:00Z' },
      },
    })
    const updateRef = vi.fn().mockResolvedValue({})

    const client = mockClient({ getRef, getCommit, createBlob, createTree, createCommit, updateRef })
    await applyPlanToGitHub(client, REPO, {
      branch: 'cr/delete',
      changes: [
        { path: 'keep.json', content: '{}' },
        { path: 'gone.json', content: null },
      ],
      message: 'mixed',
      author: AUTHOR,
    })

    // No blob POSTs at all — writes go inline, deletions carry null sha.
    expect(createBlob).not.toHaveBeenCalled()

    // The tree passed to createTree: inline content for the keep, null-sha
    // entry for the delete.
    const treeArg = createTree.mock.calls[0]![0].tree
    expect(treeArg).toEqual(expect.arrayContaining([
      { path: 'keep.json', mode: '100644', type: 'blob', content: '{}' },
      { path: 'gone.json', mode: '100644', type: 'blob', sha: null },
    ]))
  })

  it('passes write content through byte-for-byte (unicode, emoji, newlines)', async () => {
    const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: 'base' } } })
    const getCommit = vi.fn().mockResolvedValue({ data: { tree: { sha: 'bt' } } })
    const createBlob = vi.fn()
    const createTree = vi.fn().mockResolvedValue({ data: { sha: 't' } })
    const createCommit = vi.fn().mockResolvedValue({
      data: {
        sha: 'c',
        message: 'm',
        author: { name: 'MCP', email: 'ai@contentrain.io', date: '2026-01-01T00:00:00Z' },
      },
    })
    const updateRef = vi.fn().mockResolvedValue({})

    const payload = '{\n  "title": "Merhaba 🚀",\n  "emoji": "café — naïve"\n}\n'
    const client = mockClient({ getRef, getCommit, createBlob, createTree, createCommit, updateRef })
    await applyPlanToGitHub(client, REPO, {
      branch: 'cr/utf8',
      changes: [{ path: 'body.json', content: payload }],
      message: 'utf8',
      author: AUTHOR,
    })

    expect(createBlob).not.toHaveBeenCalled()
    const treeArg = createTree.mock.calls[0]![0].tree
    expect(treeArg[0].content).toBe(payload)
  })

  it('prefixes change paths with repo.contentRoot', async () => {
    const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: 'base' } } })
    const getCommit = vi.fn().mockResolvedValue({ data: { tree: { sha: 'bt' } } })
    const createBlob = vi.fn().mockResolvedValue({ data: { sha: 'b' } })
    const createTree = vi.fn().mockResolvedValue({ data: { sha: 't' } })
    const createCommit = vi.fn().mockResolvedValue({
      data: {
        sha: 'c',
        message: 'm',
        author: { name: 'MCP', email: 'ai@contentrain.io', date: '2026-01-01T00:00:00Z' },
      },
    })
    const updateRef = vi.fn().mockResolvedValue({})

    const client = mockClient({ getRef, getCommit, createBlob, createTree, createCommit, updateRef })
    await applyPlanToGitHub(
      client,
      { owner: 'o', name: 'r', contentRoot: 'apps/web' },
      {
        branch: 'cr/test',
        changes: [{ path: '.contentrain/config.json', content: '{}' }],
        message: 'm',
        author: AUTHOR,
      },
    )

    const treeArg = createTree.mock.calls[0]![0].tree
    expect(treeArg[0].path).toBe('apps/web/.contentrain/config.json')
  })
})

describe('applyPlanToGitHub with a commit SHA as base (compare-and-set)', () => {
  const PINNED = 'a'.repeat(40)

  function writeStubs() {
    return {
      getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'base-tree' } } }),
      createTree: vi.fn().mockResolvedValue({ data: { sha: 'new-tree' } }),
      createCommit: vi.fn().mockResolvedValue({ data: { sha: 'new-commit', message: 'm', author: null } }),
      createRef: vi.fn().mockResolvedValue({}),
      updateRef: vi.fn().mockResolvedValue({}),
    }
  }
  const write = (client: GitHubClient, branch: string, base?: string) =>
    applyPlanToGitHub(client, REPO, {
      branch,
      changes: [{ path: '.contentrain/content/a.json', content: '{}' }],
      message: 'm',
      author: AUTHOR,
      ...(base === undefined ? {} : { base }),
    })

  it('forks a missing branch from the SHA itself, with no lookup of the base as a ref', async () => {
    const stubs = writeStubs()
    const getRef = vi.fn().mockRejectedValueOnce(notFound())
    await write(mockClient({ getRef, ...stubs }), 'cr/new', PINNED)

    // Only the target branch is looked up; `heads/<sha>` never is.
    expect(getRef).toHaveBeenCalledTimes(1)
    expect(getRef).toHaveBeenCalledWith({ owner: 'o', repo: 'r', ref: 'heads/cr/new' })
    expect(stubs.getCommit).toHaveBeenCalledWith({ owner: 'o', repo: 'r', commit_sha: PINNED })
    expect(stubs.createCommit.mock.calls[0]![0].parents).toEqual([PINNED])
    expect(stubs.createRef).toHaveBeenCalledWith({ owner: 'o', repo: 'r', ref: 'refs/heads/cr/new', sha: 'new-commit' })
    expect(stubs.updateRef).not.toHaveBeenCalled()
  })

  it('writes onto an existing branch that still points at the SHA', async () => {
    const stubs = writeStubs()
    const getRef = vi.fn().mockResolvedValueOnce({ data: { object: { sha: PINNED } } })
    await write(mockClient({ getRef, ...stubs }), 'cr/open', PINNED.toUpperCase())

    expect(stubs.createCommit.mock.calls[0]![0].parents).toEqual([PINNED])
    // Fast-forward only (no `force`): a branch that moves after the check rejects the commit.
    expect(stubs.updateRef).toHaveBeenCalledWith({ owner: 'o', repo: 'r', ref: 'heads/cr/open', sha: 'new-commit' })
    expect(stubs.createRef).not.toHaveBeenCalled()
  })

  it('refuses with a 409 when the existing branch has moved past the SHA, writing nothing', async () => {
    const stubs = writeStubs()
    const getRef = vi.fn().mockResolvedValueOnce({ data: { object: { sha: 'b'.repeat(40) } } })

    const failure = await write(mockClient({ getRef, ...stubs }), 'cr/open', PINNED).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as { status?: number }).status).toBe(409)
    expect((failure as Error).message).toContain(PINNED)
    expect(stubs.createTree).not.toHaveBeenCalled()
    expect(stubs.createCommit).not.toHaveBeenCalled()
    expect(stubs.updateRef).not.toHaveBeenCalled()
  })

  it('surfaces an unknown SHA as the provider error, with no fallback and no write', async () => {
    const stubs = writeStubs()
    stubs.getCommit = vi.fn().mockRejectedValueOnce(Object.assign(new Error('No commit found for SHA'), { status: 422 }))
    const getRef = vi.fn().mockRejectedValueOnce(notFound())

    await expect(write(mockClient({ getRef, ...stubs }), 'cr/new', 'f'.repeat(40))).rejects.toMatchObject({ status: 422 })
    expect(getRef).toHaveBeenCalledTimes(1)
    expect(stubs.createTree).not.toHaveBeenCalled()
    expect(stubs.createRef).not.toHaveBeenCalled()
  })

  it('reads anything but a full 40-hex SHA as a branch name', async () => {
    for (const base of ['aaaaaaa', 'a'.repeat(39), `${'a'.repeat(39)}g`]) {
      const stubs = writeStubs()
      const getRef = vi.fn()
        .mockRejectedValueOnce(notFound())
        .mockResolvedValueOnce({ data: { object: { sha: 'branch-head' } } })
      await write(mockClient({ getRef, ...stubs }), 'cr/new', base)
      expect(getRef).toHaveBeenLastCalledWith({ owner: 'o', repo: 'r', ref: `heads/${base}` })
      expect(stubs.createCommit.mock.calls[0]![0].parents).toEqual(['branch-head'])
    }
  })

  it('keeps a branch-name base ignored for an existing branch, as before', async () => {
    const stubs = writeStubs()
    const getRef = vi.fn().mockResolvedValueOnce({ data: { object: { sha: 'branch-head' } } })
    await write(mockClient({ getRef, ...stubs }), 'cr/open', 'contentrain')
    expect(getRef).toHaveBeenCalledTimes(1)
    expect(stubs.createCommit.mock.calls[0]![0].parents).toEqual(['branch-head'])
  })
})
