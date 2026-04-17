import { describe, expect, it, vi } from 'vitest'
import type { GitLabClient } from '../../../src/providers/gitlab/client.js'
import {
  createBranch,
  deleteBranch,
  getBranchDiff,
  getDefaultBranch,
  isMerged,
  listBranches,
  mergeBranch,
} from '../../../src/providers/gitlab/branch-ops.js'

interface Mocks {
  branchAll?: ReturnType<typeof vi.fn>
  branchCreate?: ReturnType<typeof vi.fn>
  branchRemove?: ReturnType<typeof vi.fn>
  repoCompare?: ReturnType<typeof vi.fn>
  projectShow?: ReturnType<typeof vi.fn>
  mrCreate?: ReturnType<typeof vi.fn>
  mrAccept?: ReturnType<typeof vi.fn>
}

function mockClient(overrides: Mocks = {}): GitLabClient {
  return {
    Branches: {
      all: overrides.branchAll ?? vi.fn().mockResolvedValue([]),
      create: overrides.branchCreate ?? vi.fn(),
      remove: overrides.branchRemove ?? vi.fn(),
      show: vi.fn(),
    },
    Repositories: {
      compare: overrides.repoCompare ?? vi.fn(),
    },
    Projects: {
      show: overrides.projectShow ?? vi.fn().mockResolvedValue({ default_branch: 'main' }),
    },
    MergeRequests: {
      create: overrides.mrCreate ?? vi.fn(),
      accept: overrides.mrAccept ?? vi.fn(),
    },
  } as unknown as GitLabClient
}

describe('getDefaultBranch', () => {
  it('returns the project default branch', async () => {
    const projectShow = vi.fn().mockResolvedValue({ default_branch: 'trunk' })
    const client = mockClient({ projectShow })
    expect(await getDefaultBranch(client, { projectId: 'o/r' })).toBe('trunk')
    expect(projectShow).toHaveBeenCalledWith('o/r')
  })

  it('falls back to "main" when the API omits default_branch', async () => {
    const projectShow = vi.fn().mockResolvedValue({})
    const client = mockClient({ projectShow })
    expect(await getDefaultBranch(client, { projectId: 'o/r' })).toBe('main')
  })
})

describe('listBranches', () => {
  it('returns all branches when no prefix is given', async () => {
    const branchAll = vi.fn().mockResolvedValue([
      { name: 'main', commit: { id: 'sha-main' }, protected: true },
      { name: 'cr/content/blog/a', commit: { id: 'sha-a' }, protected: false },
    ])
    const client = mockClient({ branchAll })

    const branches = await listBranches(client, { projectId: 'o/r' })
    expect(branches).toEqual([
      { name: 'main', sha: 'sha-main', protected: true },
      { name: 'cr/content/blog/a', sha: 'sha-a', protected: false },
    ])
    expect(branchAll).toHaveBeenCalledWith('o/r', { perPage: 100, maxPages: 10 })
  })

  it('filters to a prefix using both server search and client-side guard', async () => {
    // Server returned a branch matching the substring but not the prefix;
    // the client-side filter drops it.
    const branchAll = vi.fn().mockResolvedValue([
      { name: 'cr/content/blog/a', commit: { id: 'sha-a' } },
      { name: 'feature/cr/docs', commit: { id: 'sha-b' } },
    ])
    const client = mockClient({ branchAll })

    const branches = await listBranches(client, { projectId: 'o/r' }, 'cr/')
    expect(branches.map(b => b.name)).toEqual(['cr/content/blog/a'])
    expect(branchAll).toHaveBeenCalledWith('o/r', {
      perPage: 100,
      maxPages: 10,
      search: 'cr/',
    })
  })
})

describe('createBranch', () => {
  it('delegates to Branches.create with the source ref', async () => {
    const branchCreate = vi.fn().mockResolvedValue({})
    const client = mockClient({ branchCreate })

    await createBranch(client, { projectId: 9 }, 'cr/new', 'contentrain')
    expect(branchCreate).toHaveBeenCalledWith(9, 'cr/new', 'contentrain')
  })
})

describe('deleteBranch', () => {
  it('delegates to Branches.remove', async () => {
    const branchRemove = vi.fn().mockResolvedValue({})
    const client = mockClient({ branchRemove })

    await deleteBranch(client, { projectId: 'o/r' }, 'cr/old')
    expect(branchRemove).toHaveBeenCalledWith('o/r', 'cr/old')
  })
})

describe('getBranchDiff', () => {
  it('maps GitLab diffs to FileDiff[] with normalized status', async () => {
    const repoCompare = vi.fn().mockResolvedValue({
      diffs: [
        { new_path: 'a.json', old_path: 'a.json', new_file: true },
        { new_path: 'b.json', old_path: 'b.json' }, // modified
        { new_path: 'c.json', old_path: 'c.json', deleted_file: true },
      ],
    })
    const client = mockClient({ repoCompare })

    const diffs = await getBranchDiff(client, { projectId: 'o/r' }, 'feature', 'main')
    expect(diffs).toEqual([
      { path: 'a.json', status: 'added', before: null, after: null },
      { path: 'b.json', status: 'modified', before: null, after: null },
      { path: 'c.json', status: 'removed', before: null, after: null },
    ])
    expect(repoCompare).toHaveBeenCalledWith('o/r', 'main', 'feature', { straight: false })
  })

  it('returns [] when the compare response omits diffs', async () => {
    const repoCompare = vi.fn().mockResolvedValue({})
    const client = mockClient({ repoCompare })
    expect(await getBranchDiff(client, { projectId: 'o/r' }, 'a', 'b')).toEqual([])
  })
})

describe('mergeBranch', () => {
  it('opens an MR and accepts it — returns merged: true with the merge SHA', async () => {
    const mrCreate = vi.fn().mockResolvedValue({
      iid: 42,
      web_url: 'https://gitlab.com/o/r/-/merge_requests/42',
    })
    const mrAccept = vi.fn().mockResolvedValue({
      merge_commit_sha: 'merge-sha-1',
    })
    const client = mockClient({ mrCreate, mrAccept })

    const result = await mergeBranch(client, { projectId: 'o/r' }, 'cr/feat', 'contentrain')

    expect(mrCreate).toHaveBeenCalledWith(
      'o/r',
      'cr/feat',
      'contentrain',
      '[contentrain] merge cr/feat → contentrain',
      { removeSourceBranch: false },
    )
    expect(mrAccept).toHaveBeenCalledWith(
      'o/r',
      42,
      { shouldRemoveSourceBranch: false, squash: false },
    )
    expect(result).toEqual({
      merged: true,
      sha: 'merge-sha-1',
      pullRequestUrl: 'https://gitlab.com/o/r/-/merge_requests/42',
    })
  })

  it('returns merged: false with the MR URL when no merge_commit_sha came back', async () => {
    const mrCreate = vi.fn().mockResolvedValue({
      iid: 7,
      web_url: 'https://gitlab.com/o/r/-/merge_requests/7',
    })
    const mrAccept = vi.fn().mockResolvedValue({ merge_commit_sha: null, sha: null })
    const client = mockClient({ mrCreate, mrAccept })

    const result = await mergeBranch(client, { projectId: 'o/r' }, 'cr/feat', 'contentrain')
    expect(result).toEqual({
      merged: false,
      sha: null,
      pullRequestUrl: 'https://gitlab.com/o/r/-/merge_requests/7',
    })
  })
})

describe('isMerged', () => {
  it('returns true when compare yields no commits', async () => {
    const repoCompare = vi.fn().mockResolvedValue({ commits: [] })
    const client = mockClient({ repoCompare })
    expect(await isMerged(client, { projectId: 'o/r' }, 'cr/feat', 'contentrain')).toBe(true)
    expect(repoCompare).toHaveBeenCalledWith('o/r', 'contentrain', 'cr/feat', { straight: false })
  })

  it('returns false when the branch is ahead of the target', async () => {
    const repoCompare = vi.fn().mockResolvedValue({ commits: [{ id: 'c1' }] })
    const client = mockClient({ repoCompare })
    expect(await isMerged(client, { projectId: 'o/r' }, 'cr/feat', 'contentrain')).toBe(false)
  })
})
