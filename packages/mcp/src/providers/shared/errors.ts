/**
 * Unified "is this a 404?" helper for API-backed providers.
 *
 * Two common error shapes in the provider SDKs we use:
 *
 * - **Octokit** (`@octokit/rest`) — rejects with an `Error` that has a
 *   top-level `.status` number set to the HTTP status code.
 * - **Gitbeaker** (`@gitbeaker/rest`) — rejects with a plain `Error` whose
 *   `.cause` includes `{ response: { status } }`.
 *
 * Both forms converge on `404` meaning "resource missing", so we check
 * both shapes strictly. We deliberately do NOT fall back to substring
 * matching on the error message — that leniency can silently mask other
 * 404-like errors (forbidden repo, deleted project, rate limits) and
 * produce the wrong answer. If either SDK ever stops populating the
 * status field on a legitimate 404, the regression will surface in tests
 * rather than being papered over at the reader layer.
 */
export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const direct = (error as { status?: number }).status
  if (direct === 404) return true
  const nested = (error as { cause?: { response?: { status?: number } } }).cause?.response?.status
  return nested === 404
}
