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

// The CLI no longer constructs simple-git itself — it calls `createGit` from
// @contentrain/mcp, which resolves the git binary once instead of re-walking
// PATH on every spawn. Stubbing `simple-git` here would no longer intercept
// anything: that import now lives inside the mcp package.
vi.mock('@contentrain/mcp/git/identity', () => ({
  createGit: vi.fn(() => ({
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

describe('init --locales / --domains (#512)', () => {
  it('declares both flags as strings', async () => {
    const mod = await import('../../src/commands/init.js')
    expect(mod.default.args?.locales?.type).toBe('string')
    expect(mod.default.args?.domains?.type).toBe('string')
  })

  it('parses a comma-separated list, trimmed, de-duplicated, in order', async () => {
    const { parseListFlag } = await import('../../src/commands/init.js')
    expect(parseListFlag(undefined, 'locale')).toBeUndefined()
    expect(parseListFlag('tr', 'locale')).toEqual(['tr'])
    expect(parseListFlag(' tr , en,,tr ', 'locale')).toEqual(['tr', 'en'])
    expect(parseListFlag('pt-BR', 'locale')).toEqual(['pt-BR'])
    expect(parseListFlag('docs,landing-pages', 'domain')).toEqual(['docs', 'landing-pages'])
  })

  it('rejects an invalid locale or domain, and an empty list', async () => {
    const { parseListFlag } = await import('../../src/commands/init.js')
    expect(() => parseListFlag('english', 'locale')).toThrow(/Invalid locale "english"/)
    expect(() => parseListFlag('Docs', 'domain')).toThrow(/Invalid domain "Docs"/)
    expect(() => parseListFlag(' , ', 'domain')).toThrow(/at least one domain/)
  })

  it('init --yes writes the flags in place of the defaults, the defaults otherwise', async () => {
    const { defaultInitOptions, parseListFlag } = await import('../../src/commands/init.js')
    expect(defaultInitOptions('astro', parseListFlag('tr', 'locale'), parseListFlag('docs', 'domain'))).toMatchObject({ locales: ['tr'], domains: ['docs'] })
    expect(defaultInitOptions('astro')).toMatchObject({ locales: ['en'], domains: ['marketing', 'blog', 'system'], workflow: 'auto-merge', template: null })
  })
})
