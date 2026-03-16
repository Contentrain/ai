import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

describe('serve-ui useApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefixes GET requests with /api', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    })

    const { useApi } = await import('../../src/serve-ui/src/composables/useApi.ts')
    const api = useApi()
    await expect(api.get('/status')).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledWith('/api/status', {
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('sends JSON body for POST requests', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })

    const { useApi } = await import('../../src/serve-ui/src/composables/useApi.ts')
    const api = useApi()
    await expect(api.post('/branches/approve', { branch: 'contentrain/review/hero/en/1' }))
      .resolves.toEqual({ status: 'ok' })

    expect(fetchMock).toHaveBeenCalledWith('/api/branches/approve', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ branch: 'contentrain/review/hero/en/1' }),
    })
  })

  it('throws structured error message for non-ok responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ statusCode: 422, error: 'Model not found' }),
    })

    const { useApi } = await import('../../src/serve-ui/src/composables/useApi.ts')
    const api = useApi()

    await expect(api.get('/status')).rejects.toThrow('Model not found')
  })

  it('falls back to raw text for non-JSON error responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    const { useApi } = await import('../../src/serve-ui/src/composables/useApi.ts')
    const api = useApi()

    await expect(api.get('/status')).rejects.toThrow('Internal Server Error')
  })
})
