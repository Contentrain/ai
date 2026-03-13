import { beforeEach, describe, expect, it, vi } from 'vitest'

const confirmMock = vi.fn()
const selectMock = vi.fn()
const multiselectMock = vi.fn()
const applyExtractMock = vi.fn().mockResolvedValue({
  preview: {
    models_to_create: [],
    models_to_update: [],
    total_entries: 1,
  },
})

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: selectMock,
  multiselect: multiselectMock,
  confirm: confirmMock,
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
  applyReuse: vi.fn(),
}))

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: vi.fn().mockResolvedValue('/test/project'),
  loadProjectContext: vi.fn().mockResolvedValue({
    initialized: true,
    config: {
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
  })

  it('should collect a real model id when the user chooses custom model name', async () => {
    const mod = await import('../../src/commands/normalize.js')
    await mod.default.run?.({ args: { root: '/test/project', 'skip-graph': true, 'dry-run': true } })

    expect(applyExtractMock).toHaveBeenCalled()
    expect(applyExtractMock.mock.calls[0]?.[1]?.extractions?.[0]?.model).not.toBe('custom')
  })
})
