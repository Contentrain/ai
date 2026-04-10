import { describe, it, expect, vi } from 'vitest'

const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

vi.mock('../../../src/studio/client.js', () => ({
  resolveStudioClient: vi.fn().mockResolvedValue({
    listWorkspaces: vi.fn().mockResolvedValue([{ id: 'ws-1', name: 'Test', slug: 't', plan: 'pro', role: 'owner' }]),
    listProjects: vi.fn().mockResolvedValue([{ id: 'p-1', name: 'Proj', slug: 'p', stack: 'nuxt', repositoryUrl: null, memberCount: 1 }]),
    getWorkspaceUsage: vi.fn().mockResolvedValue({
      aiMessages: { current: 100, limit: 5000, percentage: 2 },
      formSubmissions: { current: 10, limit: 1000, percentage: 1 },
      cdnBandwidthGb: { current: 1.5, limit: 10, percentage: 15 },
      mediaStorageGb: { current: 0.5, limit: 5, percentage: 10 },
    }),
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

describe('studio usage command', () => {
  it('module loads and has correct metadata', async () => {
    const mod = await import('../../../src/studio/commands/usage.js')
    expect(mod.default.meta?.name).toBe('usage')
  })

  it('outputs valid JSON in json mode', async () => {
    const mod = await import('../../../src/studio/commands/usage.js')
    await mod.default.run?.({ args: { json: true } })

    expect(writeSpy).toHaveBeenCalled()
    const output = JSON.parse(String(writeSpy.mock.calls.at(-1)?.[0] ?? '{}')) as Record<string, unknown>

    expect(output['aiMessages']).toBeDefined()
    expect(output['formSubmissions']).toBeDefined()
  })
})
