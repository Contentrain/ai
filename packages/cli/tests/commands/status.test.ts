import { describe, it, expect, vi } from 'vitest'

const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const branchMock = vi.fn().mockResolvedValue({ all: [] })
const warningMock = vi.fn()
const errorMock = vi.fn()

vi.mock('@contentrain/mcp/core/config', () => ({
  readConfig: vi.fn().mockResolvedValue({
    version: 1,
    stack: 'next',
    workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en', 'tr'] },
    domains: ['marketing'],
  }),
  readVocabulary: vi.fn().mockResolvedValue({ version: 1, terms: {} }),
}))

vi.mock('@contentrain/mcp/core/context', () => ({
  readContext: vi.fn().mockResolvedValue(null),
}))

vi.mock('@contentrain/mcp/core/model-manager', () => ({
  listModels: vi.fn().mockResolvedValue([]),
  readModel: vi.fn().mockResolvedValue(null),
  countEntries: vi.fn().mockResolvedValue({ total: 0, locales: {} }),
}))

vi.mock('@contentrain/mcp/core/validator', () => ({
  validateProject: vi.fn().mockResolvedValue({
    valid: true,
    summary: { errors: 0, warnings: 0, notices: 0, models_checked: 0, entries_checked: 0 },
    issues: [],
    fixed: 0,
  }),
}))

vi.mock('@contentrain/mcp/util/fs', () => ({
  pathExists: vi.fn().mockResolvedValue(true),
  contentrainDir: vi.fn((root: string) => `${root}/.contentrain`),
}))

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    branch: branchMock,
  })),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: errorMock, warning: warningMock, info: vi.fn() },
}))

describe('status command', () => {
  it('module loads without error', async () => {
    const mod = await import('../../src/commands/status.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('status')
  })

  it('supports --json flag', async () => {
    const mod = await import('../../src/commands/status.js')
    expect(mod.default.args?.json).toBeDefined()
    expect(mod.default.args?.json?.type).toBe('boolean')
  })

  it('should include validation and branch information in JSON mode for CI consumers', async () => {
    const mod = await import('../../src/commands/status.js')
    await mod.default.run?.({ args: { root: '/test/project', json: true } })

    expect(writeSpy).toHaveBeenCalled()
    const payload = JSON.parse(String(writeSpy.mock.calls.at(-1)?.[0] ?? '{}')) as Record<string, unknown>

    expect(payload['validation']).toBeDefined()
    expect(payload['pending_branches']).toBeDefined()
  })

  it('should surface a blocked branch-health state when the project reaches 80 pending branches', async () => {
    branchMock.mockResolvedValueOnce({
      all: Array.from({ length: 80 }, (_, i) => `contentrain/review/test-${i}`),
    })

    const mod = await import('../../src/commands/status.js')
    await mod.default.run?.({ args: { root: '/test/project' } })

    expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('80'))
  })
})
