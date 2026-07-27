import { describe, expect, it } from 'vitest'
import { normalizeOperationError } from '../../src/git/errors.js'
import { extractHttpStatus, isNotFoundError, mapProviderError } from '../../src/providers/shared/errors.js'

/**
 * Provider SDK rejections used to reach the client as bare vendor strings: a
 * documentation URL, no code, and no indication of whether the operation was
 * retryable. These cover the mapping onto the same structured envelope the
 * local git paths produce, and guard that non-provider errors are untouched.
 */

/** Shape of an `@octokit/rest` rejection. */
function octokit(message: string, status: number, headers?: Record<string, string>): Error {
  return Object.assign(new Error(message), {
    status,
    ...(headers ? { response: { headers } } : {}),
  })
}

/** Shape of a `@gitbeaker/rest` rejection. */
function gitbeaker(message: string, status: number): Error {
  return Object.assign(new Error(message), { cause: { response: { status } } })
}

describe('extractHttpStatus', () => {
  it('reads the Octokit top-level status', () => {
    expect(extractHttpStatus(octokit('Bad credentials', 401))).toBe(401)
  })

  it('reads the Gitbeaker nested status', () => {
    expect(extractHttpStatus(gitbeaker('Not Found', 404))).toBe(404)
  })

  it('returns undefined for a non-HTTP error', () => {
    expect(extractHttpStatus(new Error('fatal: not a git repository'))).toBeUndefined()
    expect(extractHttpStatus(null)).toBeUndefined()
    expect(extractHttpStatus('boom')).toBeUndefined()
  })

  it('still recognises 404 through isNotFoundError for both SDKs', () => {
    expect(isNotFoundError(octokit('Not Found', 404))).toBe(true)
    expect(isNotFoundError(gitbeaker('Not Found', 404))).toBe(true)
    expect(isNotFoundError(octokit('Forbidden', 403))).toBe(false)
    expect(isNotFoundError(new Error('nope'))).toBe(false)
  })
})

describe('mapProviderError', () => {
  it.each([
    [401, 'PROVIDER_UNAUTHORIZED'],
    [403, 'PROVIDER_FORBIDDEN'],
    [404, 'PROVIDER_NOT_FOUND'],
    [409, 'PROVIDER_CONFLICT'],
    [422, 'PROVIDER_VALIDATION_FAILED'],
    [500, 'PROVIDER_UNAVAILABLE'],
    [503, 'PROVIDER_UNAVAILABLE'],
    [418, 'PROVIDER_REQUEST_FAILED'],
  ])('maps HTTP %i to %s', (status, code) => {
    const mapped = mapProviderError(octokit('boom', status))
    expect(mapped?.code).toBe(code)
    expect(mapped?.agent_hint).toBeTruthy()
  })

  it('returns undefined for errors that are not provider failures', () => {
    expect(mapProviderError(new Error('fatal: not a git repository'))).toBeUndefined()
    expect(mapProviderError(undefined)).toBeUndefined()
  })

  it('treats an exhausted quota header as rate limiting, not a permission error', () => {
    const mapped = mapProviderError(
      octokit('API rate limit exceeded for user ID 1.', 403, { 'x-ratelimit-remaining': '0' }),
    )
    expect(mapped?.code).toBe('PROVIDER_RATE_LIMITED')
    expect(mapped?.agent_hint).toMatch(/not retry immediately/i)
  })

  it('keeps a genuine permission 403 out of the rate-limit branch', () => {
    const mapped = mapProviderError(
      octokit('Resource not accessible by integration', 403, { 'x-ratelimit-remaining': '4999' }),
    )
    expect(mapped?.code).toBe('PROVIDER_FORBIDDEN')
  })

  it('falls back to the message when no quota header is present', () => {
    expect(mapProviderError(octokit('You have exceeded a secondary rate limit', 403))?.code)
      .toBe('PROVIDER_RATE_LIMITED')
    expect(mapProviderError(octokit('Must have admin rights', 403))?.code)
      .toBe('PROVIDER_FORBIDDEN')
  })

  it('maps 429 regardless of headers', () => {
    expect(mapProviderError(octokit('Too many requests', 429))?.code).toBe('PROVIDER_RATE_LIMITED')
  })

  it('strips documentation URLs but keeps the vendor detail', () => {
    const mapped = mapProviderError(
      octokit('Reference already exists - https://docs.github.com/rest/git/refs', 422),
    )
    expect(mapped?.error).not.toContain('https://')
    expect(mapped?.error).toContain('Reference already exists')
  })

  it('caps a long embedded response body', () => {
    const mapped = mapProviderError(octokit(`Validation Failed: ${'x'.repeat(5000)}`, 422))
    expect(mapped!.error.length).toBeLessThan(300)
    expect(mapped!.error).toContain('…')
  })
})

describe('normalizeOperationError with provider errors', () => {
  it('replaces the bare vendor string with a structured envelope', () => {
    const out = normalizeOperationError(
      octokit('Resource not accessible by integration - https://docs.github.com/rest', 403),
      'content_save',
    )
    expect(out.code).toBe('PROVIDER_FORBIDDEN')
    expect(out.stage).toBe('content_save')
    expect(out.agent_hint).toBeTruthy()
    expect(out.developer_action).toBeTruthy()
    expect(out.error).not.toContain('https://')
  })

  it('maps Gitbeaker rejections the same way', () => {
    const out = normalizeOperationError(gitbeaker('Not Found', 404))
    expect(out.code).toBe('PROVIDER_NOT_FOUND')
  })

  it('leaves a local git error untouched', () => {
    const out = normalizeOperationError(new Error('fatal: not a git repository'), 'merge')
    expect(out.code).toBeUndefined()
    expect(out.error).toBe('fatal: not a git repository')
    expect(out.stage).toBe('merge')
  })

  it('keeps a Contentrain structured error rather than remapping it', () => {
    const err = Object.assign(new Error('Merge conflict'), {
      status: 409,
      code: 'CONTENT_BRANCH_MERGE_CONFLICT',
      agent_hint: 'Ask the developer to resolve it.',
    })
    const out = normalizeOperationError(err)
    expect(out.code).toBe('CONTENT_BRANCH_MERGE_CONFLICT')
    expect(out.error).toBe('Merge conflict')
  })

  it('still detects a git hook rejection', () => {
    const out = normalizeOperationError(new Error('husky > commit-msg hook failed'))
    expect(out.hook).toBeTruthy()
    expect(out.agent_hint).toMatch(/hook/i)
  })
})
