import { describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, createPublicKey, createVerify } from 'node:crypto'
import { exchangeInstallationToken, signAppJwt } from '../../../src/providers/github/app-auth.js'

function makeTestKey() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { publicKey, privateKey }
}

describe('signAppJwt', () => {
  it('produces a three-segment RS256 JWT that verifies against the public key', () => {
    const { publicKey, privateKey } = makeTestKey()
    const token = signAppJwt({ appId: 12345, privateKey })

    const parts = token.split('.')
    expect(parts).toHaveLength(3)

    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'))
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' })

    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
    expect(payload.iss).toBe('12345')
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60 * 10)
    expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))

    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${parts[0]}.${parts[1]}`)
    verifier.end()
    const signatureBytes = Buffer.from(parts[2]!, 'base64url')
    expect(verifier.verify(createPublicKey(publicKey), signatureBytes)).toBe(true)
  })
})

describe('exchangeInstallationToken', () => {
  it('POSTs to /app/installations/:id/access_tokens with the signed JWT and returns the token', async () => {
    const { privateKey } = makeTestKey()
    const mockResponse = {
      token: 'ghs_mockInstallationToken',
      expires_at: '2026-04-18T13:00:00Z',
    }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(mockResponse), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof globalThis.fetch

    const result = await exchangeInstallationToken(
      { appId: 98765, installationId: 111222, privateKey },
      { fetchImpl },
    )

    expect(result.token).toBe('ghs_mockInstallationToken')
    expect(result.expiresAt).toBe('2026-04-18T13:00:00Z')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(url).toBe('https://api.github.com/app/installations/111222/access_tokens')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Bearer ey.+/u)
    expect(headers.Accept).toBe('application/vnd.github+json')
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')
  })

  it('throws a descriptive error on non-2xx responses', async () => {
    const { privateKey } = makeTestKey()
    const fetchImpl = vi.fn(async () => new Response('Bad credentials', {
      status: 401,
      statusText: 'Unauthorized',
    })) as unknown as typeof globalThis.fetch

    await expect(exchangeInstallationToken(
      { appId: 1, installationId: 2, privateKey },
      { fetchImpl },
    )).rejects.toThrow(/installation-token exchange failed: 401 Unauthorized — Bad credentials/u)
  })

  it('accepts a custom baseUrl for GitHub Enterprise Server', async () => {
    const { privateKey } = makeTestKey()
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ token: 'x', expires_at: '2026-01-01T00:00:00Z' }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    )) as unknown as typeof globalThis.fetch

    await exchangeInstallationToken(
      { appId: 1, installationId: 2, privateKey },
      { fetchImpl, baseUrl: 'https://github.acme.internal/api/v3' },
    )
    const [url] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(url).toBe('https://github.acme.internal/api/v3/app/installations/2/access_tokens')
  })
})
