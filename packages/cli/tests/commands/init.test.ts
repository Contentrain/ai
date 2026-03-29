import { describe, it, expect, vi } from 'vitest'

vi.mock('@contentrain/mcp/util/detect', () => ({
  detectStack: vi.fn().mockResolvedValue('next'),
}))

vi.mock('@contentrain/mcp/util/fs', () => ({
  contentrainDir: vi.fn((root: string) => `${root}/.contentrain`),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  pathExists: vi.fn().mockResolvedValue(false),
  writeJson: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@contentrain/mcp/core/context', () => ({
  writeContext: vi.fn().mockResolvedValue(undefined),
  readContext: vi.fn().mockResolvedValue(null),
}))

vi.mock('@contentrain/mcp/core/config', () => ({
  readConfig: vi.fn().mockResolvedValue(null),
  readVocabulary: vi.fn().mockResolvedValue(null),
}))

vi.mock('@contentrain/mcp/core/model-manager', () => ({
  listModels: vi.fn().mockResolvedValue([]),
  writeModel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@contentrain/mcp/templates', () => ({
  getTemplate: vi.fn().mockReturnValue(null),
  listTemplates: vi.fn().mockReturnValue(['blog', 'landing', 'docs']),
}))

vi.mock('@contentrain/mcp/git/transaction', () => ({
  createTransaction: vi.fn().mockResolvedValue({
    write: vi.fn(async (cb: (wt: string) => Promise<void>) => cb('/tmp/wt')),
    commit: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue({ action: 'merged', commit: 'abc123' }),
    cleanup: vi.fn().mockResolvedValue(undefined),
  }),
  buildBranchName: vi.fn().mockReturnValue('cr/new/init/20260313'),
}))

vi.mock('@contentrain/mcp/core/scanner', () => ({
  scanSummary: vi.fn().mockResolvedValue({
    total_files: 10,
    total_candidates_estimate: 47,
    by_directory: {},
    top_repeated: [],
    file_types: {},
  }),
}))

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    init: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}))

describe('init command', () => {
  it('module loads without error', async () => {
    const mod = await import('../../src/commands/init.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('init')
  })

  it('has --yes flag for non-interactive mode', async () => {
    const mod = await import('../../src/commands/init.js')
    expect(mod.default.args?.yes).toBeDefined()
    expect(mod.default.args?.yes?.type).toBe('boolean')
  })

  it('has --root flag', async () => {
    const mod = await import('../../src/commands/init.js')
    expect(mod.default.args?.root).toBeDefined()
    expect(mod.default.args?.root?.type).toBe('string')
  })
})
