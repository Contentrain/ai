import { describe, it, expect, vi, beforeEach } from 'vitest'

const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

vi.mock('../../../src/studio/client.js', () => ({
  resolveStudioClient: vi.fn().mockResolvedValue({
    me: vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'test@contentrain.io',
      name: 'Test User',
      avatarUrl: null,
      provider: 'github',
    }),
    listWorkspaces: vi.fn().mockResolvedValue([
      { id: 'ws-1', name: 'My Workspace', slug: 'my-ws', plan: 'pro', role: 'owner' },
    ]),
  }),
}))

vi.mock('../../../src/studio/auth/credential-store.js', () => ({
  checkPermissions: vi.fn().mockResolvedValue(null),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

describe('whoami command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('module loads and has correct metadata', async () => {
    const mod = await import('../../../src/studio/commands/whoami.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('whoami')
  })

  it('supports --json flag', async () => {
    const mod = await import('../../../src/studio/commands/whoami.js')
    expect(mod.default.args?.json?.type).toBe('boolean')
  })

  it('outputs JSON with user and workspace info', async () => {
    const mod = await import('../../../src/studio/commands/whoami.js')
    await mod.default.run?.({ args: { json: true } })

    expect(writeSpy).toHaveBeenCalled()
    const output = JSON.parse(String(writeSpy.mock.calls.at(-1)?.[0] ?? '{}')) as Record<string, unknown>

    expect(output['user']).toBeDefined()
    expect((output['user'] as Record<string, unknown>)['email']).toBe('test@contentrain.io')
    expect(output['workspaces']).toBeDefined()
    expect((output['workspaces'] as unknown[]).length).toBe(1)
  })
})
