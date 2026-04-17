import { beforeEach, describe, expect, it, vi } from 'vitest'

const messageMock = vi.fn()
const successMock = vi.fn()
const infoMock = vi.fn()
const watchMock = vi.fn()

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: vi.fn().mockResolvedValue('/test/project'),
  loadProjectContext: vi.fn().mockResolvedValue({
    initialized: true,
    config: { stack: 'next' },
    models: [],
    context: null,
    vocabulary: null,
  }),
  requireInitialized: vi.fn(),
}))

vi.mock('@contentrain/query/generate', () => ({
  generate: vi.fn().mockResolvedValue({
    generatedFiles: ['index.d.ts', 'index.mjs', 'index.cjs'],
    typesCount: 2,
    dataModulesCount: 3,
    packageJsonUpdated: true,
  }),
}))

vi.mock('@contentrain/mcp/util/fs', () => ({
  contentrainDir: vi.fn((root: string) => `${root}/.contentrain`),
}))

vi.mock('../../src/utils/watch.js', () => ({
  watchPath: watchMock,
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    message: messageMock,
    success: successMock,
    error: vi.fn(),
    warning: vi.fn(),
    info: infoMock,
  },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}))

describe('generate command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should tell the user when #contentrain imports were added to package.json', async () => {
    const mod = await import('../../src/commands/generate.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(successMock).toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(expect.stringContaining('#contentrain'))
  })

  it('should watch config.json changes because generation depends on project config', async () => {
    watchMock.mockImplementation(() => ({ close: vi.fn() }))

    const mod = await import('../../src/commands/generate.js')
    const runPromise = mod.default.run?.({ args: { root: '/test/project', watch: true } })

    for (let index = 0; index < 5; index++) {
      if (watchMock.mock.calls.length > 0) break
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    expect(watchMock).toHaveBeenCalledWith(
      expect.stringContaining('/.contentrain/config.json'),
      expect.anything(),
      expect.any(Function),
    )

    void runPromise
  })

  it('emits the generate result as JSON on --json and skips pretty output', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const mod = await import('../../src/commands/generate.js')
    await mod.default.run?.({ args: { root: '/test/project', json: true } })

    expect(writeSpy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(writeSpy.mock.calls[0]?.[0] as string)
    expect(payload).toMatchObject({
      generatedFiles: ['index.d.ts', 'index.mjs', 'index.cjs'],
      typesCount: 2,
      dataModulesCount: 3,
      packageJsonUpdated: true,
    })
    expect(successMock).not.toHaveBeenCalled()
    writeSpy.mockRestore()
  })
})
