import { beforeEach, describe, expect, it, vi } from 'vitest'

const cleanupMergedBranchesMock = vi.fn()
const pruneMergedRemoteBranchesMock = vi.fn()

vi.mock('@contentrain/mcp/git/branch-lifecycle', () => ({
  cleanupMergedBranches: cleanupMergedBranchesMock,
  pruneMergedRemoteBranches: pruneMergedRemoteBranchesMock,
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

describe('prune command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    confirmMock.mockResolvedValue(true)
    cleanupMergedBranchesMock.mockResolvedValue({ deleted: 1, remaining: 0, deletedBranches: ['cr/old/1'] })
    pruneMergedRemoteBranchesMock.mockResolvedValue({ deleted: ['cr/old/1'], kept: [], errors: [] })
  })

  it('previews with dryRun, then prunes local + remote with --yes', async () => {
    const mod = await import('../../src/commands/prune.js')
    await mod.default.run?.({ args: { yes: true } } as never)

    expect(pruneMergedRemoteBranchesMock).toHaveBeenNthCalledWith(1, '/test/project', { dryRun: true })
    expect(cleanupMergedBranchesMock).toHaveBeenCalledWith('/test/project')
    expect(pruneMergedRemoteBranchesMock).toHaveBeenNthCalledWith(2, '/test/project')
    expect(process.exitCode).toBeUndefined()
  })

  it('--dry-run only previews and never mutates', async () => {
    const mod = await import('../../src/commands/prune.js')
    await mod.default.run?.({ args: { 'dry-run': true } } as never)

    expect(pruneMergedRemoteBranchesMock).toHaveBeenCalledTimes(1)
    expect(pruneMergedRemoteBranchesMock).toHaveBeenCalledWith('/test/project', { dryRun: true })
    expect(cleanupMergedBranchesMock).not.toHaveBeenCalled()
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('aborts without mutating when the confirmation is declined', async () => {
    confirmMock.mockResolvedValueOnce(false)
    const mod = await import('../../src/commands/prune.js')
    await mod.default.run?.({ args: {} } as never)

    expect(cleanupMergedBranchesMock).not.toHaveBeenCalled()
    expect(pruneMergedRemoteBranchesMock).toHaveBeenCalledTimes(1) // preview only
  })

  it('handles a project without a remote by pruning locally only', async () => {
    pruneMergedRemoteBranchesMock.mockResolvedValue({ deleted: [], kept: [], errors: [], skipped: 'no-remote' })
    const mod = await import('../../src/commands/prune.js')
    await mod.default.run?.({ args: { yes: true } } as never)

    expect(cleanupMergedBranchesMock).toHaveBeenCalledTimes(1)
    // No second (mutating) remote call — nothing to prune remotely.
    expect(pruneMergedRemoteBranchesMock).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBeUndefined()
  })

  it('json mode without --yes emits a dry-run report and does not mutate', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const mod = await import('../../src/commands/prune.js')
    await mod.default.run?.({ args: { json: true } } as never)

    expect(cleanupMergedBranchesMock).not.toHaveBeenCalled()
    expect(pruneMergedRemoteBranchesMock).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(logSpy.mock.calls[0]![0] as string) as Record<string, unknown>
    expect(payload['dry_run']).toBe(true)
    logSpy.mockRestore()
  })

  it('sets a non-zero exit code when remote deletions fail', async () => {
    pruneMergedRemoteBranchesMock
      .mockResolvedValueOnce({ deleted: ['cr/old/1'], kept: [], errors: [] })
      .mockResolvedValueOnce({ deleted: [], kept: [], errors: ['cr/old/1: protected'] })
    const mod = await import('../../src/commands/prune.js')
    await mod.default.run?.({ args: { yes: true } } as never)

    expect(process.exitCode).toBe(1)
  })
})
