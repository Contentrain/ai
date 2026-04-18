import { createPrivateKey, createSign } from 'node:crypto'

/**
 * GitHub App authentication helpers.
 *
 * Two entry points:
 *
 * - {@link signAppJwt} — mint a short-lived (10 min) GitHub App JWT from
 *   `appId` + `privateKey`. Used to authenticate app-level endpoints
 *   (listing installations, creating installation tokens).
 *
 * - {@link exchangeInstallationToken} — exchange an app JWT for a
 *   per-installation access token that can be passed straight to
 *   `Octokit({ auth: token })`. Installation tokens last ~1 hour and
 *   must be refreshed.
 *
 * Both helpers are pure — they never import `@octokit/rest` or
 * `@octokit/auth-app`. Callers that want auto-refresh behaviour should
 * either wire `@octokit/auth-app` as the `authStrategy` when constructing
 * their own Octokit (see the embedding guide), or call
 * `exchangeInstallationToken` on their own schedule.
 */

export interface AppAuthConfig {
  /** GitHub App ID (numeric, from the app's settings page). */
  appId: number
  /** PEM-encoded private key — the contents of the `.pem` the app issued. */
  privateKey: string
  /** Installation the token should be scoped to. */
  installationId: number
}

export interface InstallationTokenResult {
  /** Opaque bearer token — pass to `new Octokit({ auth: token })`. */
  token: string
  /** ISO 8601 expiry. Installation tokens expire after ~1 hour. */
  expiresAt: string
}

/**
 * Sign a GitHub App JWT.
 *
 * GitHub's spec: RS256 (RSASSA-PKCS1-v1_5), 10-minute max lifetime,
 * `iat` 60 seconds in the past to cover small clock skew, `iss`
 * set to the numeric app ID.
 */
function base64UrlEncode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
}

export function signAppJwt(config: Pick<AppAuthConfig, 'appId' | 'privateKey'>): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60,
    iss: String(config.appId),
  }

  const toSign = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`
  const keyObject = createPrivateKey({ key: config.privateKey, format: 'pem' })
  const signer = createSign('RSA-SHA256')
  signer.update(toSign)
  signer.end()
  const signature = signer.sign(keyObject).toString('base64url')

  return `${toSign}.${signature}`
}

/**
 * Exchange an App JWT for an installation-scoped access token by calling
 * GitHub's `POST /app/installations/{id}/access_tokens` endpoint.
 *
 * Uses `fetch` (Node ≥22 has it native) so the helper stays dependency-
 * free. Throws on non-2xx responses with the GitHub-returned message.
 */
export async function exchangeInstallationToken(
  config: AppAuthConfig,
  opts: { baseUrl?: string, fetchImpl?: typeof globalThis.fetch } = {},
): Promise<InstallationTokenResult> {
  const jwt = signAppJwt(config)
  const baseUrl = opts.baseUrl ?? 'https://api.github.com'
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch

  const url = `${baseUrl}/app/installations/${config.installationId}/access_tokens`
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `GitHub installation-token exchange failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
    )
  }

  const data = await response.json() as { token: string, expires_at: string }
  return { token: data.token, expiresAt: data.expires_at }
}
