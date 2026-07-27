/**
 * Error shapes for API-backed providers, and the mapping from those shapes
 * into Contentrain's structured error envelope.
 *
 * Two common error shapes in the provider SDKs we use:
 *
 * - **Octokit** (`@octokit/rest`) — rejects with an `Error` that has a
 *   top-level `.status` number set to the HTTP status code.
 * - **Gitbeaker** (`@gitbeaker/rest`) — rejects with a plain `Error` whose
 *   `.cause` includes `{ response: { status } }`.
 */

/**
 * HTTP status behind a provider SDK rejection, or `undefined` when the error
 * is not an HTTP failure (a local git error, a programming mistake, …).
 *
 * We deliberately do NOT fall back to substring matching on the error
 * message — that leniency can silently mask other failures (forbidden repo,
 * deleted project, rate limits) and produce the wrong answer. If either SDK
 * ever stops populating the status field, the regression surfaces in tests
 * rather than being papered over at the reader layer.
 */
export function extractHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const direct = (error as { status?: number }).status
  if (typeof direct === 'number') return direct
  const nested = (error as { cause?: { response?: { status?: number } } }).cause?.response?.status
  return typeof nested === 'number' ? nested : undefined
}

/** Unified "is this a 404?" helper for API-backed providers. */
export function isNotFoundError(error: unknown): boolean {
  return extractHttpStatus(error) === 404
}

/**
 * Provider SDK messages are written for a human reading a terminal, not for an
 * agent deciding what to do next. Octokit appends a documentation URL to most
 * messages and embeds the raw JSON response body on validation failures.
 *
 * The vendor text still carries the only specifics we have ("Reference already
 * exists", which field failed), so it is kept as a parenthetical detail rather
 * than discarded — but the doc links are noise for an agent, and an embedded
 * body can be arbitrarily long, so URLs are stripped and the result is capped.
 */
function sanitiseDetail(error: unknown): string {
  const raw = (error as { message?: string } | undefined)?.message ?? String(error)
  const withoutUrls = raw.replace(/\s*-?\s*https?:\/\/\S+/g, '')
  const collapsed = withoutUrls.replace(/\s+/g, ' ').trim()
  return collapsed.length > 200 ? `${collapsed.slice(0, 197)}…` : collapsed
}

/**
 * GitHub signals rate limiting with 403 plus an exhausted remaining-quota
 * header (secondary limits use 403 too), and with 429 on some endpoints.
 * Checking the header first keeps a genuine permission 403 from being
 * reported as a rate limit.
 */
function isRateLimited(error: unknown, status: number): boolean {
  if (status === 429) return true
  if (status !== 403) return false
  const headers = (error as { response?: { headers?: Record<string, unknown> } }).response?.headers
  const remaining = headers?.['x-ratelimit-remaining']
  if (remaining !== undefined) return String(remaining) === '0'
  return /\brate limit\b/i.test((error as { message?: string }).message ?? '')
}

export interface ProviderErrorInfo {
  error: string
  code: string
  agent_hint: string
  developer_action?: string
}

/**
 * Map a provider SDK rejection onto the same structured envelope the local git
 * paths already produce (`code` + `agent_hint` + `developer_action`). Returns
 * `undefined` for anything that is not a recognisable provider HTTP failure,
 * so local git errors and ordinary exceptions pass through untouched.
 */
export function mapProviderError(error: unknown): ProviderErrorInfo | undefined {
  const status = extractHttpStatus(error)
  if (status === undefined) return undefined

  const detail = sanitiseDetail(error)
  const withDetail = (summary: string): string => (detail ? `${summary} (${detail})` : summary)

  if (isRateLimited(error, status)) {
    return {
      error: withDetail('The git provider rejected the request because the API rate limit is exhausted.'),
      code: 'PROVIDER_RATE_LIMITED',
      agent_hint: 'Do not retry immediately — the limit is time-based. Stop the current operation and report it to the developer.',
      developer_action: 'Wait for the rate-limit window to reset, or use a token with a higher quota.',
    }
  }

  switch (status) {
    case 401:
      return {
        error: withDetail('The git provider rejected the credentials.'),
        code: 'PROVIDER_UNAUTHORIZED',
        agent_hint: 'The token is missing, malformed, or expired. Not retryable — ask the developer to fix the credentials.',
        developer_action: 'Check the provider token configured for this Contentrain server and reissue it if it has expired.',
      }
    case 403:
      return {
        error: withDetail('The git provider denied access to this resource.'),
        code: 'PROVIDER_FORBIDDEN',
        agent_hint: 'The credentials are valid but lack permission for this operation. Not retryable — report which operation was refused.',
        developer_action: 'Grant the token write access to the repository, or check whether branch protection or SSO authorisation is blocking it.',
      }
    case 404:
      return {
        error: withDetail('The git provider could not find the requested resource.'),
        code: 'PROVIDER_NOT_FOUND',
        agent_hint: 'The repository, branch, or path does not exist — or the token cannot see it, which also returns 404. Verify the target before retrying.',
        developer_action: 'Confirm the repository and branch names in the Contentrain config, and that the token can reach a private repository.',
      }
    case 409:
      return {
        error: withDetail('The git provider reported a conflict.'),
        code: 'PROVIDER_CONFLICT',
        agent_hint: 'The branch moved between read and write. Re-read the current state and rebuild the change before retrying once.',
        developer_action: 'Usually a concurrent write to the same branch; retrying the operation normally resolves it.',
      }
    case 422:
      return {
        error: withDetail('The git provider rejected the request as invalid.'),
        code: 'PROVIDER_VALIDATION_FAILED',
        agent_hint: 'Well-formed but semantically rejected (e.g. the ref already exists, or a name is invalid). Do not retry unchanged.',
        developer_action: 'Inspect the detail above — a stale branch left over from an earlier run is the common cause.',
      }
    default:
      if (status >= 500) {
        return {
          error: withDetail('The git provider is unavailable.'),
          code: 'PROVIDER_UNAVAILABLE',
          agent_hint: 'A server-side failure on the provider. Safe to retry once after a short pause; if it persists, stop and report it.',
          developer_action: 'Check the provider status page.',
        }
      }
      return {
        error: withDetail(`The git provider returned HTTP ${status}.`),
        code: 'PROVIDER_REQUEST_FAILED',
        agent_hint: 'An unmapped provider failure. Report the status and detail to the developer rather than retrying blindly.',
      }
  }
}
