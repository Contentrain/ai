import { describe, it, expect, vi } from 'vitest'

const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

vi.mock('../../../src/studio/client.js', () => ({
  resolveStudioClient: vi.fn().mockResolvedValue({
    listWorkspaces: vi.fn().mockResolvedValue([]),
    listProjects: vi.fn().mockResolvedValue([]),
    triggerCdnBuild: vi.fn().mockResolvedValue({
      id: 'build-1',
      status: 'success',
      fileCount: 100,
      totalSizeBytes: 51200,
      buildDurationMs: 1500,
      changedModels: ['blog'],
      errorMessage: null,
      createdAt: new Date().toISOString(),
    }),
    listCdnBuilds: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  }),
}))

vi.mock('../../../src/studio/resolve-context.js', () => ({
  resolveStudioContext: vi.fn().mockResolvedValue({ workspaceId: 'ws-1', projectId: 'p-1' }),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}))

describe('studio cdn-build command', () => {
  it('module loads and has correct metadata', async () => {
    const mod = await import('../../../src/studio/commands/cdn-build.js')
    expect(mod.default.meta?.name).toBe('cdn-build')
  })

  it('supports --wait flag', async () => {
    const mod = await import('../../../src/studio/commands/cdn-build.js')
    expect(mod.default.args?.wait?.type).toBe('boolean')
  })

  it('outputs valid JSON in json mode', async () => {
    const mod = await import('../../../src/studio/commands/cdn-build.js')
    await mod.default.run?.({ args: { json: true } })

    expect(writeSpy).toHaveBeenCalled()
    const output = JSON.parse(String(writeSpy.mock.calls.at(-1)?.[0] ?? '{}')) as Record<string, unknown>

    expect(output['status']).toBe('success')
    expect(output['fileCount']).toBe(100)
  })
})
