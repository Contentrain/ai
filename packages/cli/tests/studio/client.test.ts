import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StudioApiError, AuthExpiredError } from '../../src/studio/types.js'

// Mock credential store (prevent file I/O in unit tests)
vi.mock('../../src/studio/auth/credential-store.js', () => ({
  loadCredentials: vi.fn().mockResolvedValue({
    studioUrl: 'https://studio.test.io',
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: '2040-01-01T00:00:00Z',
  }),
  saveCredentials: vi.fn().mockResolvedValue(undefined),
  isTokenExpired: vi.fn().mockReturnValue(false),
}))

describe('StudioApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('sends Authorization header with access token', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'user-1', email: 'test@test.com', name: 'Test', avatarUrl: null, provider: 'github' }),
    })

    const { StudioApiClient } = await import('../../src/studio/client.js')
    const client = new StudioApiClient({
      studioUrl: 'https://studio.test.io',
      accessToken: 'my-token',
      refreshToken: 'my-refresh',
      expiresAt: '2040-01-01T00:00:00Z',
    })

    await client.me()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      }),
    )
  })

  it('throws StudioApiError on non-OK responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Project not found' }),
    })

    const { StudioApiClient } = await import('../../src/studio/client.js')
    const client = new StudioApiClient({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2040-01-01T00:00:00Z',
    })

    try {
      await client.listWorkspaces()
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(StudioApiError)
      expect((err as StudioApiError).statusCode).toBe(404)
    }
  })

  it('throws AuthExpiredError on 401 when refresh fails', async () => {
    // First request returns 401
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Token expired' }),
    })

    // Refresh attempt also fails
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })

    const { StudioApiClient } = await import('../../src/studio/client.js')
    const client = new StudioApiClient({
      studioUrl: 'https://studio.test.io',
      accessToken: 'expired-token',
      refreshToken: 'bad-refresh',
      expiresAt: '2040-01-01T00:00:00Z',
    })

    await expect(client.me()).rejects.toThrow(AuthExpiredError)
  })

  it('retries after successful token refresh on 401', async () => {
    // First request returns 401
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Token expired' }),
    })

    // Refresh succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresAt: '2040-01-01T00:00:00Z',
      }),
    })

    // Retry succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'user-1', email: 'test@test.com', name: 'Test', avatarUrl: null, provider: 'github' }),
    })

    const { StudioApiClient } = await import('../../src/studio/client.js')
    const client = new StudioApiClient({
      studioUrl: 'https://studio.test.io',
      accessToken: 'expired-token',
      refreshToken: 'good-refresh',
      expiresAt: '2040-01-01T00:00:00Z',
    })

    const user = await client.me()
    expect(user.email).toBe('test@test.com')
    expect(fetchMock).toHaveBeenCalledTimes(3) // original + refresh + retry
  })

  it('sends JSON body for POST requests', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'key-1', name: 'test', prefix: 'crn_', createdAt: '2025-01-01' }),
    })

    const { StudioApiClient } = await import('../../src/studio/client.js')
    const client = new StudioApiClient({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2040-01-01T00:00:00Z',
    })

    await client.createCdnKey('ws-1', 'proj-1', 'test-key')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/cdn/keys'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ name: 'test-key' }),
      }),
    )
  })

  it('handles 204 No Content responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    const { StudioApiClient } = await import('../../src/studio/client.js')
    const client = new StudioApiClient({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2040-01-01T00:00:00Z',
    })

    await expect(client.logout()).resolves.not.toThrow()
  })

  it('encodes branch names in URLs', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    const { StudioApiClient } = await import('../../src/studio/client.js')
    const client = new StudioApiClient({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2040-01-01T00:00:00Z',
    })

    await client.mergeBranch('ws-1', 'proj-1', 'cr/content/blog-posts')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('cr%2Fcontent%2Fblog-posts'),
      expect.anything(),
    )
  })

  it('resolveStudioClient throws when not logged in', async () => {
    vi.resetModules()
    vi.doMock('../../src/studio/auth/credential-store.js', () => ({
      loadCredentials: vi.fn().mockResolvedValue(null),
      saveCredentials: vi.fn(),
      isTokenExpired: vi.fn().mockReturnValue(false),
    }))

    const { resolveStudioClient } = await import('../../src/studio/client.js')
    await expect(resolveStudioClient()).rejects.toThrow('Not logged in')
  })
})
