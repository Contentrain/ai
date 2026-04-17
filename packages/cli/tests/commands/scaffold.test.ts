import { beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()
const closeMock = vi.fn()

vi.mock('../../src/utils/mcp-client.js', () => ({
  openMcpSession: vi.fn(async () => ({
    call: callMock,
    close: closeMock,
  })),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  select: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  isCancel: vi.fn().mockReturnValue(false),
}))

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: vi.fn(async (r?: string) => r ?? '/test/project'),
}))

describe('scaffold command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    callMock.mockResolvedValue({
      status: 'committed',
      models_created: [{ id: 'blog-post' }],
      content_created: 3,
      vocabulary_terms_added: 0,
      git: { branch: 'cr/new/scaffold-blog/1700000000-aaaa', action: 'auto-merged', commit: 'abc1234' },
      next_steps: ['Run contentrain validate'],
    })
  })

  it('passes --template and --no-sample to contentrain_scaffold', async () => {
    const mod = await import('../../src/commands/scaffold.js')
    await mod.default.run?.({ args: { template: 'blog', 'no-sample': true } } as never)

    expect(callMock).toHaveBeenCalledWith('contentrain_scaffold', {
      template: 'blog',
      with_sample_content: false,
    })
  })

  it('splits --locales into an array', async () => {
    const mod = await import('../../src/commands/scaffold.js')
    await mod.default.run?.({ args: { template: 'blog', locales: 'en,tr, de' } } as never)

    expect(callMock).toHaveBeenCalledWith('contentrain_scaffold', expect.objectContaining({
      locales: ['en', 'tr', 'de'],
      template: 'blog',
    }))
  })

  it('errors when --template is missing and --json is set (no interactive picker)', async () => {
    const mod = await import('../../src/commands/scaffold.js')
    await mod.default.run?.({ args: { json: true } } as never)

    expect(callMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
