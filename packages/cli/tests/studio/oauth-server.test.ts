import { describe, it, expect, afterEach } from 'vitest'
import type { OAuthServer } from '../../src/studio/auth/oauth-server.js'

describe('oauth-server', () => {
  let server: OAuthServer | null = null
  let pendingCallback: Promise<unknown> | null = null

  afterEach(async () => {
    if (server) {
      // Absorb any pending rejection to avoid unhandled promise warnings
      if (pendingCallback) {
        pendingCallback.catch(() => { /* expected rejection from close() */ })
      }
      server.close()
      server = null
      pendingCallback = null
    }
  })

  it('starts on a port in the expected range', async () => {
    const { startOAuthServer } = await import('../../src/studio/auth/oauth-server.js')

    server = await startOAuthServer(5_000)

    expect(server.callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)

    const port = Number.parseInt(new URL(server.callbackUrl).port, 10)
    expect(port).toBeGreaterThanOrEqual(9876)
    expect(port).toBeLessThanOrEqual(9899)
  })

  it('generates a UUID state parameter', async () => {
    const { startOAuthServer } = await import('../../src/studio/auth/oauth-server.js')

    server = await startOAuthServer(5_000)

    expect(server.state).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('resolves callback with code and state', async () => {
    const { startOAuthServer } = await import('../../src/studio/auth/oauth-server.js')

    server = await startOAuthServer(5_000)

    const callbackPromise = server.waitForCallback()
    pendingCallback = callbackPromise

    // Simulate OAuth provider redirect
    const callbackUrl = `${server.callbackUrl}?code=test-code&state=${server.state}`
    await globalThis.fetch(callbackUrl)

    const result = await callbackPromise
    pendingCallback = null
    expect(result.code).toBe('test-code')
    expect(result.state).toBe(server.state)
  })

  it('rejects when OAuth provider returns error', async () => {
    const { startOAuthServer } = await import('../../src/studio/auth/oauth-server.js')

    server = await startOAuthServer(5_000)

    const callbackPromise = server.waitForCallback()
    pendingCallback = callbackPromise

    const callbackUrl = `${server.callbackUrl}?error=access_denied`
    await globalThis.fetch(callbackUrl)

    await expect(callbackPromise).rejects.toThrow('access_denied')
    pendingCallback = null
  })

  it('rejects when callback has no code', async () => {
    const { startOAuthServer } = await import('../../src/studio/auth/oauth-server.js')

    server = await startOAuthServer(5_000)

    const callbackPromise = server.waitForCallback()
    pendingCallback = callbackPromise

    await globalThis.fetch(server.callbackUrl)

    await expect(callbackPromise).rejects.toThrow('missing code or state')
    pendingCallback = null
  })

  it('times out after specified duration', async () => {
    const { startOAuthServer } = await import('../../src/studio/auth/oauth-server.js')

    server = await startOAuthServer(500) // 500ms timeout

    const callbackPromise = server.waitForCallback()
    pendingCallback = callbackPromise

    await expect(callbackPromise).rejects.toThrow('timed out')
    pendingCallback = null
  }, 5_000)

  it('returns 404 for non-callback routes', async () => {
    const { startOAuthServer } = await import('../../src/studio/auth/oauth-server.js')

    server = await startOAuthServer(5_000)

    const baseUrl = server.callbackUrl.replace('/callback', '')
    const res = await globalThis.fetch(`${baseUrl}/other`)

    expect(res.status).toBe(404)
  })

  it('close() rejects pending callback', async () => {
    const { startOAuthServer } = await import('../../src/studio/auth/oauth-server.js')

    server = await startOAuthServer(30_000)

    const callbackPromise = server.waitForCallback()
    pendingCallback = callbackPromise

    server.close()

    await expect(callbackPromise).rejects.toThrow('cancelled')
    pendingCallback = null
    server = null // Already closed
  })
})
