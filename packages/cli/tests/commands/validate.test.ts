import { describe, it, expect, vi } from 'vitest'

const errorMock = vi.fn()

vi.mock('@contentrain/mcp/core/config', () => ({
  readConfig: vi.fn().mockResolvedValue({
    version: 1, stack: 'next', workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en'] }, domains: ['marketing'],
  }),
  readVocabulary: vi.fn().mockResolvedValue({ version: 1, terms: {} }),
}))

vi.mock('@contentrain/mcp/core/context', () => ({
  readContext: vi.fn().mockResolvedValue(null),
}))

vi.mock('@contentrain/mcp/core/model-manager', () => ({
  listModels: vi.fn().mockResolvedValue([]),
}))

vi.mock('@contentrain/mcp/core/validator', () => ({
  validateProject: vi.fn().mockResolvedValue({
    valid: true,
    summary: { errors: 0, warnings: 0, notices: 0, models_checked: 1, entries_checked: 5 },
    issues: [],
    fixed: 0,
  }),
}))

vi.mock('@contentrain/mcp/git/branch-lifecycle', () => ({
  checkBranchHealth: vi.fn().mockResolvedValue({
    blocked: true,
    message: 'Too many active contentrain branches',
  }),
}))

vi.mock('@contentrain/mcp/util/fs', () => ({
  pathExists: vi.fn().mockResolvedValue(true),
  contentrainDir: vi.fn((root: string) => `${root}/.contentrain`),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: errorMock, warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}))

describe('validate command', () => {
  it('module loads without error', async () => {
    const mod = await import('../../src/commands/validate.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('validate')
  })

  it('supports all flags', async () => {
    const mod = await import('../../src/commands/validate.js')
    expect(mod.default.args?.fix?.type).toBe('boolean')
    expect(mod.default.args?.interactive?.type).toBe('boolean')
    expect(mod.default.args?.json?.type).toBe('boolean')
    expect(mod.default.args?.model?.type).toBe('string')
    expect(mod.default.args?.watch?.type).toBe('boolean')
  })

  it('should fail the command when auto-fix is blocked by branch health', async () => {
    process.exitCode = undefined

    const mod = await import('../../src/commands/validate.js')
    await mod.default.run?.({ args: { root: '/test/project', fix: true } })

    expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('Too many active'))
    expect(process.exitCode).toBe(1)
  })
})
