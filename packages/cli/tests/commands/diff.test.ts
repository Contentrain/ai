import { beforeEach, describe, expect, it, vi } from 'vitest'

const branchMock = vi.fn()
const branchLocalMock = vi.fn()
const revparseMock = vi.fn().mockResolvedValue('feature/redesign')
const diffSummaryMock = vi.fn().mockResolvedValue({ changed: 1, insertions: 5, deletions: 1 })
const mergeMock = vi.fn()
const checkoutMock = vi.fn()
const rawMock = vi.fn()
const deleteLocalBranchMock = vi.fn()

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    branch: branchMock,
    branchLocal: branchLocalMock,
    revparse: revparseMock,
    diffSummary: diffSummaryMock,
    diff: vi.fn().mockResolvedValue(''),
    merge: mergeMock,
    checkout: checkoutMock,
    deleteLocalBranch: deleteLocalBranchMock,
    raw: rawMock,
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
    branchMock.mockResolvedValue({ all: ['contentrain/review/hero'] })
    branchLocalMock.mockResolvedValue({ all: ['main', 'contentrain'], current: 'main' })
    rawMock.mockResolvedValue('main')
    selectMock.mockResolvedValue('__skip')
  })

  it('should diff against the configured base branch, not the current feature branch', async () => {
    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(diffSummaryMock).toHaveBeenCalledWith(['main...contentrain/review/hero'])
  })

  it('should filter out contentrain system branch from branch listing', async () => {
    branchMock.mockResolvedValue({ all: ['contentrain', 'contentrain/review/hero'] })
    diffSummaryMock.mockClear()

    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    // Should only diff contentrain/review/hero, not the system 'contentrain' branch
    expect(diffSummaryMock).toHaveBeenCalledTimes(1)
    expect(diffSummaryMock).toHaveBeenCalledWith(['main...contentrain/review/hero'])
  })

  it('should use worktree merge pattern when merging a branch', async () => {
    selectMock.mockResolvedValueOnce('contentrain/review/hero').mockResolvedValueOnce('merge')
    confirmMock.mockResolvedValueOnce(true)
    rawMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'branch' && args[1] === '--show-current') return 'main'
      if (args[0] === 'rev-parse') return 'abc123'
      return ''
    })

    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    // Should NOT checkout baseBranch directly (old pattern)
    // Instead should use worktree add + update-ref
    expect(rawMock).toHaveBeenCalledWith(
      expect.arrayContaining(['worktree', 'add']),
    )
  })

  it('should label the merge action with the actual base branch instead of current branch', async () => {
    selectMock.mockResolvedValueOnce('contentrain/review/hero').mockResolvedValueOnce('skip')

    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(selectMock.mock.calls[1]?.[0]?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringContaining('main') }),
      ]),
    )
  })
})
