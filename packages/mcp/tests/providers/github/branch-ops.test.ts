import { describe, expect, it, vi } from 'vitest'
import type { GitHubClient } from '../../../src/providers/github/client.js'
import { mergeBranch } from '../../../src/providers/github/branch-ops.js'

interface Mocks {
  merge?: ReturnType<typeof vi.fn>
  deleteRef?: ReturnType<typeof vi.fn>
  get?: ReturnType<typeof vi.fn>
}

function mockClient(overrides: Mocks = {}): GitHubClient {
  return {
    rest: {
      repos: {
        merge: overrides.merge ?? vi.fn().mockResolvedValue({ data: { sha: 'merge-sha' } }),
        // getDefaultBranch (used by the cleanup guard) — default 'main'.
        get: overrides.get ?? vi.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
      },
      git: {
        deleteRef: overrides.deleteRef ?? vi.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as GitHubClient
}

const repo = { owner: 'o', name: 'r' }

describe('mergeBranch', () => {
  it('does NOT delete the source ref by default (opt-in)', async () => {
    const merge = vi.fn().mockResolvedValue({ data: { sha: 'merge-sha' } })
    const deleteRef = vi.fn()
    const client = mockClient({ merge, deleteRef })

    const result = await mergeBranch(client, repo, 'cr/feat', 'contentrain')

    expect(merge).toHaveBeenCalledWith({ owner: 'o', repo: 'r', base: 'contentrain', head: 'cr/feat' })
    expect(deleteRef).not.toHaveBeenCalled()
    expect(result).toEqual({ merged: true, sha: 'merge-sha', pullRequestUrl: null })
  })

  it('deletes the source ref when removeSourceBranch: true', async () => {
    const deleteRef = vi.fn().mockResolvedValue(undefined)
    const client = mockClient({ deleteRef })

    const result = await mergeBranch(client, repo, 'cr/feat', 'contentrain', { removeSourceBranch: true })

    expect(deleteRef).toHaveBeenCalledWith({ owner: 'o', repo: 'r', ref: 'heads/cr/feat' })
    expect(result.remote).toEqual({ deleted: true })
  })

  it('keeps the source ref when removeSourceBranch is false', async () => {
    const deleteRef = vi.fn()
    const client = mockClient({ deleteRef })

    const result = await mergeBranch(client, repo, 'cr/feat', 'contentrain', { removeSourceBranch: false })

    expect(deleteRef).not.toHaveBeenCalled()
    expect(result.remote).toBeUndefined()
  })

  // ─── Guard: never delete a long-lived branch, even when opted in ───

  it('refuses to delete the merge target (into), even with removeSourceBranch: true', async () => {
    const deleteRef = vi.fn()
    const client = mockClient({ deleteRef })

    // A caller confusing head/base: merging main INTO main, asking to delete.
    const result = await mergeBranch(client, repo, 'main', 'main', { removeSourceBranch: true })

    expect(deleteRef).not.toHaveBeenCalled()
    expect(result.remote).toEqual({ deleted: false, skipped: 'protected' })
  })

  it('refuses to delete the repo default branch (e.g. main→contentrain), even with removeSourceBranch: true', async () => {
    const deleteRef = vi.fn()
    const get = vi.fn().mockResolvedValue({ data: { default_branch: 'main' } })
    const client = mockClient({ deleteRef, get })

    const result = await mergeBranch(client, repo, 'main', 'contentrain', { removeSourceBranch: true })

    expect(deleteRef).not.toHaveBeenCalled()
    expect(result.remote).toEqual({ deleted: false, skipped: 'protected' })
  })

  it('refuses to delete the contentrain content branch (contentrain→main), even with removeSourceBranch: true', async () => {
    const deleteRef = vi.fn()
    const client = mockClient({ deleteRef })

    const result = await mergeBranch(client, repo, 'contentrain', 'main', { removeSourceBranch: true })

    expect(deleteRef).not.toHaveBeenCalled()
    expect(result.remote).toEqual({ deleted: false, skipped: 'protected' })
  })

  it('fails safe (no delete) when the default branch cannot be resolved', async () => {
    const deleteRef = vi.fn()
    const get = vi.fn().mockRejectedValue(new Error('Server Error'))
    const client = mockClient({ deleteRef, get })

    const result = await mergeBranch(client, repo, 'cr/feat', 'contentrain', { removeSourceBranch: true })

    expect(deleteRef).not.toHaveBeenCalled()
    expect(result.remote).toEqual({ deleted: false, skipped: 'protected' })
  })

  // ─── Opted-in cleanup edge cases ───

  it('treats an already-merged (204) response as merged and still cleans up when opted in', async () => {
    const merge = vi.fn().mockRejectedValue(Object.assign(new Error('not modified'), { status: 204 }))
    const deleteRef = vi.fn().mockResolvedValue(undefined)
    const client = mockClient({ merge, deleteRef })

    const result = await mergeBranch(client, repo, 'cr/feat', 'contentrain', { removeSourceBranch: true })

    expect(result.merged).toBe(true)
    expect(result.sha).toBeNull()
    expect(result.remote).toEqual({ deleted: true })
  })

  it('treats 404/422 on cleanup as already gone', async () => {
    const deleteRef = vi.fn().mockRejectedValue(Object.assign(new Error('Reference does not exist'), { status: 422 }))
    const client = mockClient({ deleteRef })

    const result = await mergeBranch(client, repo, 'cr/feat', 'contentrain', { removeSourceBranch: true })

    expect(result.merged).toBe(true)
    expect(result.remote).toEqual({ deleted: false, skipped: 'not-found' })
  })

  it('surfaces other cleanup failures as a warning without failing the merge', async () => {
    const deleteRef = vi.fn().mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
    const client = mockClient({ deleteRef })

    const result = await mergeBranch(client, repo, 'cr/feat', 'contentrain', { removeSourceBranch: true })

    expect(result.merged).toBe(true)
    expect(result.remote?.deleted).toBe(false)
    expect(result.remote?.warning).toContain('cr/feat')
  })

  it('propagates merge failures without attempting cleanup', async () => {
    const merge = vi.fn().mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }))
    const deleteRef = vi.fn()
    const client = mockClient({ merge, deleteRef })

    await expect(mergeBranch(client, repo, 'cr/feat', 'contentrain', { removeSourceBranch: true })).rejects.toThrow('Conflict')
    expect(deleteRef).not.toHaveBeenCalled()
  })
})
