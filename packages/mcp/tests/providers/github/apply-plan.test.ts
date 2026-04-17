import { describe, expect, it, vi } from 'vitest'
import { applyPlanToGitHub } from '../../../src/providers/github/apply-plan.js'
import type { GitHubClient } from '../../../src/providers/github/client.js'

/**
 * applyPlanToGitHub unit tests — exercise the Git Data API write flow
 * against a mocked Octokit. Validates that blobs are created for writes,
 * deletions emit null-sha tree entries, branches are created vs. updated
 * depending on existence, and the default branch is the fallback base.
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
const AUTHOR = { name: 'MCP', email: 'mcp@contentrain.io' }

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
        author: { name: 'MCP', email: 'mcp@contentrain.io', date: '2026-01-01T00:00:00Z' },
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
    expect(createBlob).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      content: '{}',
      encoding: 'utf-8',
    })
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
        author: { name: 'MCP', email: 'mcp@contentrain.io', date: '2026-01-01T00:00:00Z' },
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
        author: { name: 'MCP', email: 'mcp@contentrain.io', date: '2026-01-01T00:00:00Z' },
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
        author: { name: 'MCP', email: 'mcp@contentrain.io', date: '2026-01-01T00:00:00Z' },
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

    // Exactly one blob was created (the keep), the deletion should not trigger createBlob.
    expect(createBlob).toHaveBeenCalledTimes(1)
    expect(createBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', content: '{}', encoding: 'utf-8' })

    // The tree passed to createTree contains a null-sha entry for the deleted path.
    const treeArg = createTree.mock.calls[0]![0].tree
    expect(treeArg).toEqual(expect.arrayContaining([
      { path: 'keep.json', mode: '100644', type: 'blob', sha: 'b' },
      { path: 'gone.json', mode: '100644', type: 'blob', sha: null },
    ]))
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
        author: { name: 'MCP', email: 'mcp@contentrain.io', date: '2026-01-01T00:00:00Z' },
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
