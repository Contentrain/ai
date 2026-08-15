import { beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()
const closeMock = vi.fn()

vi.mock('../../src/utils/mcp-client.js', () => ({
  openMcpSession: vi.fn(async () => ({ call: callMock, close: closeMock })),
}))

const selectMock = vi.fn()

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  select: selectMock,
  isCancel: vi.fn().mockReturnValue(false),
}))

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: vi.fn(async (r?: string) => r ?? '/test/project'),
}))

const PREVIEW_CLEAN = {
  status: 'preview',
  base: 'main',
  summary: { files_merged: 2, entries_taken_ours: 1, entries_taken_theirs: 3, entries_field_merged: 0 },
  changes: [{ path: '.contentrain/models/faq.json', action: 'write' }],
  conflicts: [],
}

describe('reconcile command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
  })

  it('stops at in_sync without a second call', async () => {
    callMock.mockResolvedValueOnce({ status: 'in_sync', message: 'nothing to do' })
    const mod = await import('../../src/commands/reconcile.js')
    await mod.default.run?.({ args: {} } as never)

    expect(callMock).toHaveBeenCalledTimes(1)
    expect(callMock).toHaveBeenCalledWith('contentrain_reconcile', { dry_run: true })
    expect(closeMock).toHaveBeenCalled()
  })

  it('executes a clean plan with --yes and no prompting', async () => {
    callMock
      .mockResolvedValueOnce(PREVIEW_CLEAN)
      .mockResolvedValueOnce({ status: 'reconciled', message: 'done', commit: 'abc123def' })
    const mod = await import('../../src/commands/reconcile.js')
    await mod.default.run?.({ args: { yes: true } } as never)

    expect(selectMock).not.toHaveBeenCalled()
    expect(callMock).toHaveBeenNthCalledWith(2, 'contentrain_reconcile', { dry_run: false })
    expect(process.exitCode).toBeUndefined()
  })

  it('collects interactive decisions and passes them as resolutions', async () => {
    callMock
      .mockResolvedValueOnce({
        ...PREVIEW_CLEAN,
        conflicts: [{
          id: 'abc123', path: '.contentrain/vocabulary.json', kind: 'vocabulary',
          key: 'brand', locale: 'en', ours: 'Ours', theirs: 'Theirs',
          message: 'Term "brand" has two different "en" translations.',
        }],
      })
      .mockResolvedValueOnce({ status: 'reconciled', message: 'done' })
    selectMock.mockResolvedValueOnce('theirs')

    const mod = await import('../../src/commands/reconcile.js')
    await mod.default.run?.({ args: {} } as never)

    expect(callMock).toHaveBeenNthCalledWith(2, 'contentrain_reconcile', {
      dry_run: false,
      resolutions: [{ id: 'abc123', choose: 'theirs' }],
    })
  })

  it('a skipped decision aborts without writing', async () => {
    callMock.mockResolvedValueOnce({
      ...PREVIEW_CLEAN,
      conflicts: [{
        id: 'abc123', path: 'x', kind: 'dictionary', key: 'k', message: 'conflict',
      }],
    })
    selectMock.mockResolvedValueOnce('skip')

    const mod = await import('../../src/commands/reconcile.js')
    await mod.default.run?.({ args: {} } as never)

    expect(callMock).toHaveBeenCalledTimes(1)
  })

  it('--json emits the dry-run verbatim and never executes', async () => {
    callMock.mockResolvedValueOnce(PREVIEW_CLEAN)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const mod = await import('../../src/commands/reconcile.js')
    await mod.default.run?.({ args: { json: true } } as never)
    write.mockRestore()

    expect(callMock).toHaveBeenCalledTimes(1)
  })
})
