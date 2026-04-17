import { beforeEach, describe, expect, it, vi } from 'vitest'

// `commands/diff.ts` delegates heavy lifting to two MCP helpers:
// `branchDiff` for the per-branch summary + detail diff (base =
// CONTENTRAIN_BRANCH), and `mergeBranch` for the merge action. These
// tests mock the helpers directly instead of the simple-git surface
// — that's the contract the CLI lives against now.

const branchDiffMock = vi.fn()
const mergeBranchMock = vi.fn()

vi.mock('@contentrain/mcp/git/transaction', () => ({
  mergeBranch: mergeBranchMock,
}))

vi.mock('@contentrain/mcp/git/branch-lifecycle', () => ({
  branchDiff: branchDiffMock,
}))

// `simple-git` is still used for branch listing (not yet migrated to a
// dedicated MCP helper).
const branchMock = vi.fn()

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    branch: branchMock,
  })),
}))

const selectMock = vi.fn()
const confirmMock = vi.fn()

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  select: selectMock,
  confirm: confirmMock,
  isCancel: vi.fn().mockReturnValue(false),
}))

describe('diff command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    branchMock.mockResolvedValue({ all: ['cr/content/blog/1234-aaaa'] })
    branchDiffMock.mockResolvedValue({
      branch: 'cr/content/blog/1234-aaaa',
      base: 'contentrain',
      stat: ' .contentrain/content/blog/en.json | 2 +-',
      patch: '+{"title":"Hello"}\n',
      filesChanged: 1,
    })
    selectMock.mockResolvedValue('__skip')
  })

  it('computes each branch summary by calling branchDiff (base defaults to CONTENTRAIN_BRANCH)', async () => {
    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(branchDiffMock).toHaveBeenCalledWith('/test/project', {
      branch: 'cr/content/blog/1234-aaaa',
    })
  })

  it('filters out the `contentrain` singleton branch from the review list', async () => {
    // `branch --list cr/*` would not return `contentrain`, so the
    // only thing to filter is the edge case where a stray match
    // sneaks in. Keep the behaviour explicit so regressions surface.
    branchMock.mockResolvedValue({ all: ['contentrain', 'cr/content/blog/1234-aaaa'] })
    branchDiffMock.mockClear()

    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(branchDiffMock).toHaveBeenCalledTimes(1)
    expect(branchDiffMock).toHaveBeenCalledWith('/test/project', {
      branch: 'cr/content/blog/1234-aaaa',
    })
  })

  it('delegates merge to MCP mergeBranch helper instead of reimplementing the worktree dance', async () => {
    selectMock
      .mockResolvedValueOnce('cr/content/blog/1234-aaaa')
      .mockResolvedValueOnce('merge')
    confirmMock.mockResolvedValueOnce(true)
    mergeBranchMock.mockResolvedValueOnce({
      action: 'auto-merged',
      commit: 'abc1234',
      sync: { synced: [], skipped: [] },
    })

    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(mergeBranchMock).toHaveBeenCalledWith('/test/project', 'cr/content/blog/1234-aaaa')
  })

  it('labels the merge action with the content-tracking branch (contentrain), not the repo default', async () => {
    // The old command labelled this "Merge into main"; the new one
    // labels it "Merge into contentrain + advance base" because the
    // feature branch actually forks from `contentrain`, not `main`.
    selectMock
      .mockResolvedValueOnce('cr/content/blog/1234-aaaa')
      .mockResolvedValueOnce('skip')

    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(selectMock.mock.calls[1]?.[0]?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringContaining('contentrain') }),
      ]),
    )
  })
})
