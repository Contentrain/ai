import { describe, it, expect, vi, beforeEach } from 'vitest'

const branchMock = vi.fn().mockResolvedValue({ all: ['cr/new/init'] })
const readDirMock = vi.fn().mockResolvedValue([])
const outroMock = vi.fn()

// Mock all external dependencies
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    version: vi.fn().mockResolvedValue({ major: 2, minor: 45, patch: 0 }),
    branch: branchMock,
  })),
}))

vi.mock('@contentrain/mcp/core/config', () => ({
  readConfig: vi.fn().mockResolvedValue({
    version: 1,
    stack: 'next',
    workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en'] },
    domains: ['marketing'],
  }),
}))

vi.mock('@contentrain/mcp/core/model-manager', () => ({
  listModels: vi.fn().mockResolvedValue([
    { id: 'hero', kind: 'singleton', domain: 'marketing', i18n: false, fields: 3 },
  ]),
  readModel: vi.fn().mockResolvedValue({
    id: 'hero',
    name: 'Hero',
    kind: 'singleton',
    domain: 'marketing',
    i18n: false,
    fields: { title: { type: 'string' } },
  }),
}))

vi.mock('@contentrain/mcp/util/fs', () => ({
  pathExists: vi.fn().mockResolvedValue(true),
  contentrainDir: vi.fn((root: string) => `${root}/.contentrain`),
  readDir: readDirMock,
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: outroMock,
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}))

describe('doctor command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('module loads without error', async () => {
    const mod = await import('../../src/commands/doctor.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('doctor')
  })

  it('has correct args definition', async () => {
    const mod = await import('../../src/commands/doctor.js')
    expect(mod.default.args?.root).toBeDefined()
  })

  it('should not fail health when only 6 pending contentrain branches exist', async () => {
    branchMock.mockResolvedValueOnce({
      all: Array.from({ length: 6 }, (_, i) => `cr/review/test-${i}`),
    })

    const mod = await import('../../src/commands/doctor.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(outroMock).toHaveBeenCalledWith(expect.not.stringContaining('failed'))
  })

  it('should inspect custom content_path locations for orphan content checks', async () => {
    const { listModels, readModel } = await import('@contentrain/mcp/core/model-manager')
    vi.mocked(listModels).mockResolvedValueOnce([
      {
        id: 'authors',
        kind: 'collection',
        domain: 'marketing',
        i18n: true,
        fields: 2,
        content_path: 'src/content/authors',
      } as never,
    ])
    vi.mocked(readModel).mockResolvedValue({
      id: 'authors',
      name: 'Authors',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      fields: { name: { type: 'string' } },
      content_path: 'src/content/authors',
    } as never)

    const mod = await import('../../src/commands/doctor.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(readDirMock).toHaveBeenCalledWith('/test/project/src/content/authors')
  })
})
