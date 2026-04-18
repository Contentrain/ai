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
}))

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: vi.fn(async (r?: string) => r ?? '/test/project'),
}))

describe('describe command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    callMock.mockResolvedValue({
      id: 'blog-post',
      name: 'Blog Post',
      kind: 'collection',
      domain: 'content',
      i18n: true,
      fields: { title: { type: 'string', required: true } },
      stats: { total_entries: 3, locales: { en: 3 } },
      import_snippet: "import { useBlogPost } from '#contentrain'",
    })
  })

  it('invokes contentrain_describe with the positional model arg', async () => {
    const mod = await import('../../src/commands/describe.js')
    await mod.default.run?.({ args: { model: 'blog-post' } } as never)

    expect(callMock).toHaveBeenCalledWith('contentrain_describe', {
      model: 'blog-post',
      include_sample: false,
    })
    expect(closeMock).toHaveBeenCalled()
  })

  it('forwards --sample and --locale flags', async () => {
    const mod = await import('../../src/commands/describe.js')
    await mod.default.run?.({ args: { model: 'blog-post', sample: true, locale: 'tr' } } as never)

    expect(callMock).toHaveBeenCalledWith('contentrain_describe', {
      model: 'blog-post',
      include_sample: true,
      locale: 'tr',
    })
  })

  it('emits raw JSON on --json', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const mod = await import('../../src/commands/describe.js')
    await mod.default.run?.({ args: { model: 'blog-post', json: true } } as never)

    expect(writeSpy).toHaveBeenCalledTimes(1)
    const payload = writeSpy.mock.calls[0]?.[0] as string
    expect(JSON.parse(payload).id).toBe('blog-post')
    writeSpy.mockRestore()
  })

  it('closes the session even when the tool throws', async () => {
    callMock.mockRejectedValueOnce(new Error('boom'))
    const mod = await import('../../src/commands/describe.js')
    await mod.default.run?.({ args: { model: 'missing' } } as never)

    expect(closeMock).toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
