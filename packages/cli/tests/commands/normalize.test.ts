import { beforeEach, describe, expect, it, vi } from 'vitest'

const confirmMock = vi.fn()
const selectMock = vi.fn()
const multiselectMock = vi.fn()
const textMock = vi.fn()
const messageMock = vi.fn()
const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const applyExtractMock = vi.fn().mockResolvedValue({
  preview: {
    models_to_create: [],
    models_to_update: [],
    total_entries: 1,
  },
})
const applyReuseMock = vi.fn().mockResolvedValue({
  preview: {
    files_to_modify: ['app/page.tsx'],
    patches_count: 1,
    imports_to_add: 0,
  },
})

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: messageMock, success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: selectMock,
  multiselect: multiselectMock,
  confirm: confirmMock,
  text: textMock,
  isCancel: vi.fn().mockReturnValue(false),
}))

vi.mock('@contentrain/mcp/core/scanner', () => ({
  scanSummary: vi.fn().mockResolvedValue({
    total_candidates_estimate: 1,
    total_files: 1,
    by_directory: {},
    top_repeated: [],
  }),
  scanCandidates: vi.fn().mockResolvedValue({
    candidates: [
      { file: 'app/page.tsx', line: 10, value: 'Hello world', surrounding: '<h1>Hello world</h1>' },
    ],
    stats: { has_more: false },
  }),
}))

vi.mock('@contentrain/mcp/core/graph-builder', () => ({
  buildGraph: vi.fn(),
}))

vi.mock('@contentrain/mcp/core/apply-manager', () => ({
  applyExtract: applyExtractMock,
  applyReuse: applyReuseMock,
}))

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: vi.fn().mockResolvedValue('/test/project'),
  loadProjectContext: vi.fn().mockResolvedValue({
    initialized: true,
    config: {
      stack: 'nuxt',
      domains: ['marketing'],
      locales: { default: 'en', supported: ['en'] },
    },
    models: [],
  }),
  requireInitialized: vi.fn(),
}))

describe('normalize command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockResolvedValueOnce(true)
    multiselectMock.mockResolvedValueOnce(['0'])
    selectMock.mockResolvedValueOnce('custom')
    textMock.mockResolvedValueOnce('ui-strings')
  })

  it('should collect a real model id when the user chooses custom model name', async () => {
    const mod = await import('../../src/commands/normalize.js')
    await mod.default.run?.({ args: { root: '/test/project', 'skip-graph': true, 'dry-run': true } })

    expect(applyExtractMock).toHaveBeenCalled()
    expect(applyExtractMock.mock.calls[0]?.[1]?.extractions?.[0]?.model).not.toBe('custom')
  })

  it('should honor --json by avoiding interactive prompts and returning structured output', async () => {
    const mod = await import('../../src/commands/normalize.js')
    await mod.default.run?.({ args: { root: '/test/project', json: true } })

    expect(confirmMock).not.toHaveBeenCalled()
    expect(selectMock).not.toHaveBeenCalled()
    expect(multiselectMock).not.toHaveBeenCalled()
    expect(writeSpy).toHaveBeenCalled()
    expect(messageMock).not.toHaveBeenCalledWith(expect.stringContaining('Continue with detailed scan?'))
  })

  it('should not generate framework-agnostic reuse patches without import data', async () => {
    applyExtractMock
      .mockResolvedValueOnce({
        preview: {
          models_to_create: [],
          models_to_update: [],
          total_entries: 1,
        },
      })
      .mockResolvedValueOnce({
        results: {
          models_created: ['ui-strings'],
          models_updated: [],
          entries_written: 1,
          source_map: [
            { model: 'ui-strings', locale: 'en', value: 'Hello world', file: 'app/page.tsx', line: 10 },
          ],
        },
        git: { branch: 'contentrain/normalize/extract/test', action: 'pending-review', commit: 'abc123' },
      })

    confirmMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    multiselectMock.mockResolvedValueOnce(['0'])
    selectMock.mockResolvedValueOnce('ui-strings')

    const mod = await import('../../src/commands/normalize.js')
    await mod.default.run?.({ args: { root: '/test/project', 'skip-graph': true } })

    expect(applyReuseMock).toHaveBeenCalled()
    const patch = applyReuseMock.mock.calls[0]?.[1]?.patches?.[0]
    expect(patch?.import_statement).toBeDefined()
  })
})
