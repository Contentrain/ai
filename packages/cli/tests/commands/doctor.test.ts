import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all external dependencies
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    version: vi.fn().mockResolvedValue({ major: 2, minor: 45, patch: 0 }),
    branch: vi.fn().mockResolvedValue({ all: ['contentrain/new/init'] }),
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
  readDir: vi.fn().mockResolvedValue([]),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
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
    const meta = mod.default.meta as Record<string, unknown>
    expect(meta?.name).toBe('doctor')
  })

  it('has correct args definition', async () => {
    const mod = await import('../../src/commands/doctor.js')
    const args = mod.default.args as Record<string, Record<string, unknown>>
    expect(args?.root).toBeDefined()
  })
})
