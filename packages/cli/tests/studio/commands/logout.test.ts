import { describe, it, expect, vi } from 'vitest'

const clearMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../src/studio/auth/credential-store.js', () => ({
  loadCredentials: vi.fn().mockResolvedValue({
    studioUrl: 'https://studio.test.io',
    accessToken: 'token',
    refreshToken: 'refresh',
    expiresAt: '2040-01-01T00:00:00Z',
  }),
  clearCredentials: clearMock,
}))

vi.mock('../../../src/studio/client.js', () => ({
  StudioApiClient: vi.fn().mockImplementation(() => ({
    logout: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

describe('logout command', () => {
  it('module loads and has correct metadata', async () => {
    const mod = await import('../../../src/studio/commands/logout.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('logout')
  })

  it('clears credentials on run', async () => {
    const mod = await import('../../../src/studio/commands/logout.js')
    await mod.default.run?.({ args: {} })

    expect(clearMock).toHaveBeenCalled()
  })
})
