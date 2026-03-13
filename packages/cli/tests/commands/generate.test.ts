import { beforeEach, describe, expect, it, vi } from 'vitest'

const messageMock = vi.fn()
const successMock = vi.fn()

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

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    message: messageMock,
    success: successMock,
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
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
    expect(messageMock).toHaveBeenCalledWith(expect.stringContaining('#contentrain'))
  })
})
