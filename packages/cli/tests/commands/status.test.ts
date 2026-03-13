import { describe, it, expect, vi } from 'vitest'

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
    branch: vi.fn().mockResolvedValue({ all: [] }),
  })),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

describe('status command', () => {
  it('module loads without error', async () => {
    const mod = await import('../../src/commands/status.js')
    expect(mod.default).toBeDefined()
    const meta = mod.default.meta as Record<string, unknown>
    expect(meta?.name).toBe('status')
  })

  it('supports --json flag', async () => {
    const mod = await import('../../src/commands/status.js')
    const args = mod.default.args as Record<string, Record<string, unknown>>
    expect(args?.json).toBeDefined()
    expect(args?.json?.type).toBe('boolean')
  })
})
