import { beforeEach, describe, expect, it, vi } from 'vitest'

const mergeBranchMock = vi.fn()

vi.mock('@contentrain/mcp/git/transaction', () => ({
  mergeBranch: mergeBranchMock,
}))

const branchLocalMock = vi.fn()

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    branchLocal: branchLocalMock,
  })),
}))

const confirmMock = vi.fn()

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  confirm: confirmMock,
  isCancel: vi.fn().mockReturnValue(false),
}))

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: vi.fn(async (r?: string) => r ?? '/test/project'),
}))

describe('merge command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    branchLocalMock.mockResolvedValue({ all: ['cr/content/blog/1234-aaaa', 'contentrain', 'main'] })
    confirmMock.mockResolvedValue(true)
    mergeBranchMock.mockResolvedValue({
      action: 'merged',
      commit: 'abcdef1234',
      sync: { synced: ['.contentrain/content/blog/en.json'], skipped: [] },
    })
  })

  it('delegates to the MCP mergeBranch helper with the positional branch arg', async () => {
    const mod = await import('../../src/commands/merge.js')
    await mod.default.run?.({ args: { branch: 'cr/content/blog/1234-aaaa', yes: true } } as never)

    expect(mergeBranchMock).toHaveBeenCalledWith('/test/project', 'cr/content/blog/1234-aaaa')
  })

  it('refuses to merge the contentrain singleton branch into itself', async () => {
    const mod = await import('../../src/commands/merge.js')
    await mod.default.run?.({ args: { branch: 'contentrain', yes: true } } as never)

    expect(mergeBranchMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('errors when the branch does not exist locally', async () => {
    branchLocalMock.mockResolvedValueOnce({ all: ['contentrain', 'main'] })
    const mod = await import('../../src/commands/merge.js')
    await mod.default.run?.({ args: { branch: 'cr/content/blog/1234-aaaa', yes: true } } as never)

    expect(mergeBranchMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('prompts for confirmation by default and aborts when declined', async () => {
    confirmMock.mockResolvedValueOnce(false)
    const mod = await import('../../src/commands/merge.js')
    await mod.default.run?.({ args: { branch: 'cr/content/blog/1234-aaaa' } } as never)

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(mergeBranchMock).not.toHaveBeenCalled()
  })
})
