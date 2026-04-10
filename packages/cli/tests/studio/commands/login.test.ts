import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/studio/auth/credential-store.js', () => ({
  loadCredentials: vi.fn().mockResolvedValue(null),
  saveCredentials: vi.fn().mockResolvedValue(undefined),
  checkPermissions: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../../src/studio/auth/oauth-server.js', () => ({
  startOAuthServer: vi.fn(),
}))

vi.mock('../../../src/studio/client.js', () => ({
  StudioApiClient: vi.fn().mockImplementation(() => ({
    me: vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test',
      avatarUrl: null,
      provider: 'github',
    }),
  })),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn().mockResolvedValue('github'),
  confirm: vi.fn().mockResolvedValue(true),
  isCancel: vi.fn().mockReturnValue(false),
}))

describe('login command', () => {
  it('module loads and has correct metadata', async () => {
    const mod = await import('../../../src/studio/commands/login.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('login')
  })

  it('supports --url and --provider args', async () => {
    const mod = await import('../../../src/studio/commands/login.js')
    expect(mod.default.args?.url?.type).toBe('string')
    expect(mod.default.args?.provider?.type).toBe('string')
  })
})
