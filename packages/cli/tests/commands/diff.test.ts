import { beforeEach, describe, expect, it, vi } from 'vitest'

const branchMock = vi.fn().mockResolvedValue({ all: ['contentrain/review/hero'] })
const revparseMock = vi.fn().mockResolvedValue('feature/redesign')
const diffSummaryMock = vi.fn().mockResolvedValue({ changed: 1, insertions: 5, deletions: 1 })

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    branch: branchMock,
    revparse: revparseMock,
    diffSummary: diffSummaryMock,
    diff: vi.fn().mockResolvedValue(''),
    merge: vi.fn(),
    deleteLocalBranch: vi.fn(),
  })),
}))

const selectMock = vi.fn().mockResolvedValue('__skip')

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  select: selectMock,
  confirm: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}))

describe('diff command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['CONTENTRAIN_BRANCH'] = 'main'
  })

  it('should diff against the configured base branch, not the current feature branch', async () => {
    const mod = await import('../../src/commands/diff.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(diffSummaryMock).toHaveBeenCalledWith(['main...contentrain/review/hero'])
  })
})
