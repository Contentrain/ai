import { beforeEach, describe, expect, it, vi } from 'vitest'

const branchMock = vi.fn().mockResolvedValue({ all: ['contentrain/review/hero'] })
const revparseMock = vi.fn().mockResolvedValue('feature/redesign')
const diffSummaryMock = vi.fn().mockResolvedValue({ changed: 1, insertions: 5, deletions: 1 })
const mergeMock = vi.fn()
const checkoutMock = vi.fn()

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    branch: branchMock,
    revparse: revparseMock,
    diffSummary: diffSummaryMock,
    diff: vi.fn().mockResolvedValue(''),
    merge: mergeMock,
    checkout: checkoutMock,
    deleteLocalBranch: vi.fn(),
    raw: vi.fn().mockResolvedValue('feature/redesign'),
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
    process.env['CONTENTRAIN_BRANCH'] = 'main'
    selectMock.mockResolvedValue('__skip')
  })

  it('should diff against the configured base branch, not the current feature branch', async () => {
    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(diffSummaryMock).toHaveBeenCalledWith(['main...contentrain/review/hero'])
  })

  it('should merge into the configured base branch instead of whichever branch is currently checked out', async () => {
    selectMock.mockResolvedValueOnce('contentrain/review/hero').mockResolvedValueOnce('merge')
    confirmMock.mockResolvedValueOnce(true)

    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(checkoutMock).toHaveBeenCalledWith('main')
    expect(mergeMock).toHaveBeenCalledWith(['contentrain/review/hero', '--no-edit'])
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
