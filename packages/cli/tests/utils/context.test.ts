import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveProjectRoot, loadProjectContext, requireInitialized } from '../../src/utils/context.js'
import { resolve } from 'node:path'

// Mock MCP modules
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
  readContext: vi.fn().mockResolvedValue({
    version: '1',
    lastOperation: { tool: 'contentrain_init', model: '', timestamp: '2026-01-01' },
    stats: { models: 0, entries: 0, locales: ['en'], lastSync: '2026-01-01' },
  }),
}))

vi.mock('@contentrain/mcp/core/model-manager', () => ({
  listModels: vi.fn().mockResolvedValue([]),
}))

vi.mock('@contentrain/mcp/util/fs', () => ({
  pathExists: vi.fn().mockResolvedValue(true),
  contentrainDir: vi.fn((root: string) => `${root}/.contentrain`),
}))

describe('resolveProjectRoot', () => {
  beforeEach(() => {
    delete process.env['CONTENTRAIN_PROJECT_ROOT']
  })

  it('uses argument when provided', async () => {
    const result = await resolveProjectRoot('/custom/path')
    expect(result).toBe(resolve('/custom/path'))
  })

  it('uses env var when no argument', async () => {
    process.env['CONTENTRAIN_PROJECT_ROOT'] = '/env/path'
    const result = await resolveProjectRoot()
    expect(result).toBe(resolve('/env/path'))
  })

  it('falls back to cwd', async () => {
    const result = await resolveProjectRoot()
    expect(result).toBe(resolve(process.cwd()))
  })
})

describe('loadProjectContext', () => {
  it('loads context for initialized project', async () => {
    const ctx = await loadProjectContext('/test/project')
    expect(ctx.initialized).toBe(true)
    expect(ctx.config).not.toBeNull()
    expect(ctx.config?.stack).toBe('next')
  })

  it('treats missing config.json as uninitialized even if .contentrain exists', async () => {
    const { pathExists } = await import('@contentrain/mcp/util/fs')
    const { readConfig } = await import('@contentrain/mcp/core/config')

    vi.mocked(pathExists).mockResolvedValueOnce(true)
    vi.mocked(readConfig).mockResolvedValueOnce(null)

    const ctx = await loadProjectContext('/test/project')
    expect(ctx.initialized).toBe(false)
    expect(ctx.config).toBeNull()
    expect(ctx.models).toEqual([])
  })

  it('returns empty context for uninitialized project', async () => {
    const { pathExists } = await import('@contentrain/mcp/util/fs')
    vi.mocked(pathExists).mockResolvedValueOnce(false)

    const ctx = await loadProjectContext('/test/project')
    expect(ctx.initialized).toBe(false)
    expect(ctx.config).toBeNull()
    expect(ctx.models).toEqual([])
  })
})

describe('requireInitialized', () => {
  it('throws for uninitialized project', () => {
    expect(() =>
      requireInitialized({
        projectRoot: '/test',
        crDir: '/test/.contentrain',
        initialized: false,
        config: null,
        context: null,
        models: [],
        vocabulary: null,
      }),
    ).toThrow('Project not initialized')
  })

  it('passes for initialized project', async () => {
    const ctx = await loadProjectContext('/test/project')
    expect(() => requireInitialized(ctx)).not.toThrow()
  })
})
