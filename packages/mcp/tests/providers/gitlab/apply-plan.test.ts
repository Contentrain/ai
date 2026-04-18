import { describe, expect, it, vi } from 'vitest'
import type { GitLabClient } from '../../../src/providers/gitlab/client.js'
import { applyPlanToGitLab } from '../../../src/providers/gitlab/apply-plan.js'

/**
 * applyPlanToGitLab unit tests — drive a mocked gitbeaker client and
 * assert the exact Commits.create payload plus the returned Commit
 * envelope.
 */

interface Mocks {
  branchShow?: ReturnType<typeof vi.fn>
  projectShow?: ReturnType<typeof vi.fn>
  fileShow?: ReturnType<typeof vi.fn>
  commitsCreate?: ReturnType<typeof vi.fn>
}

function mockClient(overrides: Mocks = {}): GitLabClient {
  return {
    Branches: {
      show: overrides.branchShow ?? vi.fn().mockRejectedValue(notFound()),
    },
    Projects: {
      show: overrides.projectShow ?? vi.fn().mockResolvedValue({ default_branch: 'main' }),
    },
    RepositoryFiles: {
      show: overrides.fileShow ?? vi.fn().mockRejectedValue(notFound()),
    },
    Commits: {
      create: overrides.commitsCreate ?? vi.fn().mockResolvedValue({
        id: 'new-commit-sha',
        message: 'test',
        author_name: 'Contentrain',
        author_email: 'mcp@contentrain.io',
        created_at: '2026-04-17T12:00:00Z',
      }),
    },
  } as unknown as GitLabClient
}

function notFound(): Error {
  return Object.assign(new Error('Not Found'), { cause: { response: { status: 404 } } })
}

describe('applyPlanToGitLab', () => {
  it('commits all changes in one Commits.create call on a new branch', async () => {
    const commitsCreate = vi.fn().mockResolvedValue({
      id: 'sha-1',
      message: '[contentrain] test',
      author_name: 'Contentrain',
      author_email: 'mcp@contentrain.io',
      created_at: '2026-04-17T12:00:00Z',
    })
    const client = mockClient({ commitsCreate })

    const commit = await applyPlanToGitLab(client, { projectId: 'o/r' }, {
      branch: 'cr/content/blog/1234',
      base: 'contentrain',
      message: '[contentrain] test',
      author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
      changes: [
        { path: '.contentrain/content/m/blog/en.json', content: '{"a":1}' },
        { path: '.contentrain/meta/blog/en.json', content: '{}' },
      ],
    })

    expect(commit.sha).toBe('sha-1')
    expect(commitsCreate).toHaveBeenCalledTimes(1)
    const [projectId, branch, message, actions, options] = commitsCreate.mock.calls[0]!
    expect(projectId).toBe('o/r')
    expect(branch).toBe('cr/content/blog/1234')
    expect(message).toBe('[contentrain] test')
    expect(actions).toEqual([
      {
        action: 'create',
        filePath: '.contentrain/content/m/blog/en.json',
        content: '{"a":1}',
        encoding: 'text',
      },
      {
        action: 'create',
        filePath: '.contentrain/meta/blog/en.json',
        content: '{}',
        encoding: 'text',
      },
    ])
    expect(options).toEqual({
      authorName: 'Contentrain',
      authorEmail: 'mcp@contentrain.io',
      startBranch: 'contentrain',
    })
  })

  it('omits startBranch when the branch already exists and uses update for existing files', async () => {
    const branchShow = vi.fn().mockResolvedValue({ name: 'cr/content/blog/1234' })
    // First change targets an existing file, second a fresh one.
    const fileShow = vi.fn()
      .mockResolvedValueOnce({ file_path: '.contentrain/content/m/blog/en.json' })
      .mockRejectedValueOnce(notFound())
    const commitsCreate = vi.fn().mockResolvedValue({
      id: 'sha-2',
      message: '[contentrain] update',
      author_name: 'Contentrain',
      author_email: 'mcp@contentrain.io',
      created_at: '2026-04-17T12:00:00Z',
    })

    const client = mockClient({ branchShow, fileShow, commitsCreate })
    await applyPlanToGitLab(client, { projectId: 7 }, {
      branch: 'cr/content/blog/1234',
      message: '[contentrain] update',
      author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
      changes: [
        { path: '.contentrain/content/m/blog/en.json', content: '{"a":2}' },
        { path: '.contentrain/meta/blog/en.json', content: '{}' },
      ],
    })

    const [, , , actions, options] = commitsCreate.mock.calls[0]!
    expect(actions[0].action).toBe('update')
    expect(actions[1].action).toBe('create')
    expect(options).not.toHaveProperty('startBranch')
  })

  it('emits delete actions for non-null→null changes and filters absent-file deletes', async () => {
    const branchShow = vi.fn().mockResolvedValue({ name: 'cr/content/blog/1234' })
    const fileShow = vi.fn()
      .mockResolvedValueOnce({ file_path: 'exists.json' })  // exists, will emit delete
      .mockRejectedValueOnce(notFound())                    // absent, filtered out
      .mockResolvedValueOnce({ file_path: 'keep.json' })    // exists, update
    const commitsCreate = vi.fn().mockResolvedValue({
      id: 'sha-3',
      message: 'mix',
      author_name: 'Contentrain',
      author_email: 'mcp@contentrain.io',
      created_at: '2026-04-17T12:00:00Z',
    })
    const client = mockClient({ branchShow, fileShow, commitsCreate })

    await applyPlanToGitLab(client, { projectId: 'o/r' }, {
      branch: 'cr/content/blog/1234',
      message: 'mix',
      author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
      changes: [
        { path: 'exists.json', content: null },
        { path: 'absent.json', content: null },
        { path: 'keep.json', content: '{"k":1}' },
      ],
    })

    const [, , , actions] = commitsCreate.mock.calls[0]!
    expect(actions).toHaveLength(2)
    expect(actions[0]).toEqual({ action: 'delete', filePath: 'exists.json' })
    expect(actions[1]).toEqual({
      action: 'update',
      filePath: 'keep.json',
      content: '{"k":1}',
      encoding: 'text',
    })
  })

  it('applies the contentRoot prefix to every action path', async () => {
    const commitsCreate = vi.fn().mockResolvedValue({
      id: 'sha-4',
      message: 'root',
      author_name: 'Contentrain',
      author_email: 'mcp@contentrain.io',
      created_at: '2026-04-17T12:00:00Z',
    })
    const client = mockClient({ commitsCreate })

    await applyPlanToGitLab(client, { projectId: 'o/r', contentRoot: 'apps/web' }, {
      branch: 'new',
      message: 'root',
      author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
      changes: [
        { path: '.contentrain/context.json', content: '{}' },
      ],
    })

    const [, , , actions] = commitsCreate.mock.calls[0]!
    expect(actions[0].filePath).toBe('apps/web/.contentrain/context.json')
  })

  it('defaults to the contentrain branch when input.base is absent', async () => {
    // Invariant — same as the GitHub path: forks from the content-tracking
    // branch, not the GitLab project's default branch. `Projects.show` must
    // NOT be consulted for base resolution.
    const projectShow = vi.fn().mockResolvedValue({ default_branch: 'trunk' })
    const commitsCreate = vi.fn().mockResolvedValue({
      id: 'sha-5',
      message: 'default',
      author_name: 'Contentrain',
      author_email: 'mcp@contentrain.io',
      created_at: '2026-04-17T12:00:00Z',
    })
    const client = mockClient({ projectShow, commitsCreate })

    await applyPlanToGitLab(client, { projectId: 'o/r' }, {
      branch: 'new',
      message: 'default',
      author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
      changes: [{ path: 'x.json', content: '{}' }],
    })

    const [, , , , options] = commitsCreate.mock.calls[0]!
    expect(options.startBranch).toBe('contentrain')
    expect(projectShow).not.toHaveBeenCalled()
  })

  it('throws when the plan reduces to zero actions', async () => {
    const branchShow = vi.fn().mockResolvedValue({ name: 'exists' })
    const fileShow = vi.fn().mockRejectedValue(notFound())  // all deletes would be no-ops
    const client = mockClient({ branchShow, fileShow })

    await expect(
      applyPlanToGitLab(client, { projectId: 'o/r' }, {
        branch: 'exists',
        message: 'empty',
        author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
        changes: [{ path: 'gone.json', content: null }],
      }),
    ).rejects.toThrow(/no applicable actions/)
  })

  it('returns a normalised Commit envelope from the GitLab response', async () => {
    const commitsCreate = vi.fn().mockResolvedValue({
      id: 'sha-envelope',
      message: 'resp msg',
      author_name: 'Gitbeaker User',
      author_email: 'user@example.com',
      created_at: '2026-04-17T13:00:00Z',
    })
    const client = mockClient({ commitsCreate })

    const commit = await applyPlanToGitLab(client, { projectId: 'o/r' }, {
      branch: 'new',
      message: 'client msg',
      author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
      changes: [{ path: 'x.json', content: '{}' }],
    })

    expect(commit).toEqual({
      sha: 'sha-envelope',
      message: 'resp msg',
      author: { name: 'Gitbeaker User', email: 'user@example.com' },
      timestamp: '2026-04-17T13:00:00.000Z',
    })
  })
})
