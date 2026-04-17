import { describe, it, expect, vi } from 'vitest'

const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

vi.mock('../../../src/studio/client.js', () => ({
  resolveStudioClient: vi.fn().mockResolvedValue({
    listWorkspaces: vi.fn().mockResolvedValue([
      { id: 'ws-1', name: 'Acme Corp', slug: 'acme', plan: 'pro', role: 'owner' },
    ]),
    listProjects: vi.fn().mockResolvedValue([
      { id: 'proj-1', name: 'Website', slug: 'website', stack: 'nuxt', repositoryUrl: null, memberCount: 3 },
    ]),
    listBranches: vi.fn().mockResolvedValue([
      { name: 'cr/content/blog', ahead: 2, lastCommitDate: new Date().toISOString(), author: 'editor@acme.com' },
    ]),
    listCdnBuilds: vi.fn().mockResolvedValue({
      data: [{ id: 'b-1', status: 'success', fileCount: 42, totalSizeBytes: 1024, buildDurationMs: 2000, createdAt: new Date().toISOString() }],
      total: 1,
    }),
  }),
}))

vi.mock('../../../src/studio/resolve-context.js', () => ({
  resolveStudioContext: vi.fn().mockResolvedValue({ workspaceId: 'ws-1', projectId: 'proj-1' }),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}))

describe('studio status command', () => {
  it('module loads and has correct metadata', async () => {
    const mod = await import('../../../src/studio/commands/status.js')
    expect(mod.default.meta?.name).toBe('status')
  })

  it('supports --json flag', async () => {
    const mod = await import('../../../src/studio/commands/status.js')
    expect(mod.default.args?.json?.type).toBe('boolean')
  })

  it('outputs valid JSON in json mode', async () => {
    const mod = await import('../../../src/studio/commands/status.js')
    await mod.default.run?.({ args: { json: true } })

    expect(writeSpy).toHaveBeenCalled()
    const output = JSON.parse(String(writeSpy.mock.calls.at(-1)?.[0] ?? '{}')) as Record<string, unknown>

    expect(output['workspace']).toBeDefined()
    expect(output['project']).toBeDefined()
    expect(output['branches']).toBeDefined()
  })
})
