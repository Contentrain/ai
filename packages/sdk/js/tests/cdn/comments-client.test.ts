import { describe, it, expect, vi, afterEach } from 'vitest'
import { CommentsClient } from '../../src/cdn/comments-client.js'
import { ContentrainError } from '../../src/cdn/errors.js'
import thread from '../fixtures/public-api/comments.read.response.json'
import submitRequest from '../fixtures/public-api/comments.submit.request.json'
import submitPending from '../fixtures/public-api/comments.submit.pending.response.json'
import submitApproved from '../fixtures/public-api/comments.submit.approved.response.json'
import submitHoneypot from '../fixtures/public-api/comments.submit.honeypot.response.json'
import invalidRequest from '../fixtures/public-api/comments.submit.invalid.request.json'
import submitErrors from '../fixtures/public-api/comments.submit.validation-error.response.json'
import errors from '../fixtures/public-api/errors.json'

// Fixtures are byte-for-byte copies of Studio's public-API wire fixtures —
// the server contract. See ../fixtures/public-api/README.md.

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  })
}

function createClient() {
  return new CommentsClient({ baseUrl: 'https://studio.test/api/comments/v1', projectId: 'proj1' })
}

describe('CommentsClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('thread() reads a page of roots with nested replies and the thread config', async () => {
    const fetchMock = mockFetch(thread)
    vi.stubGlobal('fetch', fetchMock)
    const result = await createClient().thread('posts', 'hello-world', { locale: 'en', page: 1, limit: 20, sort: 'oldest' })

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit | undefined]
    expect(url).toBe('https://studio.test/api/comments/v1/proj1/posts/hello-world?locale=en&page=1&limit=20&sort=oldest')
    expect(opts).toBeUndefined()

    expect(result.entry).toEqual({ modelId: 'posts', entryId: 'hello-world', locale: 'en' })
    expect(result.config).toMatchObject({ closed: false, maxDepth: 4, captcha: 'turnstile', captchaSiteKey: '0x4AAAAAAA-fixture-site-key', honeypotField: '_hp' })
    expect(result.total).toBe(1)
    const [root] = result.comments
    expect(root!.author).toEqual({ name: 'Ada', url: 'https://ada.dev/', isModerator: false })
    expect(root!.replies[0]!.author.isModerator).toBe(true)
    expect(root!.replies[0]!.parentId).toBe(root!.id)
  })

  it('thread() sends only the query parameters given', async () => {
    const fetchMock = mockFetch(thread)
    vi.stubGlobal('fetch', fetchMock)
    await createClient().thread('posts', 'e1')
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://studio.test/api/comments/v1/proj1/posts/e1')
    await createClient().thread('posts', 'e1', { sort: 'newest' })
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe('https://studio.test/api/comments/v1/proj1/posts/e1?sort=newest')
  })

  it('the public shape carries no email, IP, user agent or referrer', () => {
    const raw = JSON.stringify(thread)
    for (const secret of ['email', 'source_ip', 'user_agent', 'referrer', 'author_email']) {
      expect(raw).not.toContain(secret)
    }
  })

  it('submit() posts the documented body (root comment: parentId null) with the locale on the query string', async () => {
    const fetchMock = mockFetch(submitPending)
    vi.stubGlobal('fetch', fetchMock)
    const result = await createClient().submit(
      'posts',
      'hello-world',
      {
        author: { name: 'Grace', email: 'grace@example.com', url: 'https://grace.dev' },
        body: 'Great post!',
        captchaToken: '0.turnstile-token-from-the-widget',
        honeypot: '',
      },
      { locale: 'en' },
    )
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://studio.test/api/comments/v1/proj1/posts/hello-world?locale=en')
    expect(opts.method).toBe('POST')
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(Object.keys(opts.headers as object).map((h) => h.toLowerCase())).not.toContain('authorization')
    expect(JSON.parse(opts.body as string)).toEqual(submitRequest)

    expect(result).toEqual(submitPending)
    expect(result.status).toBe('pending')
    expect(result.comment!.id).toBe('33333333-3333-4333-8333-333333333333')
  })

  it('a reply carries the parent id; an approved verdict returns the comment to render now', async () => {
    const fetchMock = mockFetch(submitApproved)
    vi.stubGlobal('fetch', fetchMock)
    const result = await createClient().submit('posts', 'hello-world', { author: { name: 'Grace' }, body: 'Great post!', parentId: '11111111-1111-4111-8111-111111111111' })
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      author: { name: 'Grace' },
      body: 'Great post!',
      parentId: '11111111-1111-4111-8111-111111111111',
    })
    expect(result.status).toBe('approved')
    expect(result.comment!.depth).toBe(0)
  })

  it('a swallowed honeypot post is a bare pending success with no comment', async () => {
    vi.stubGlobal('fetch', mockFetch(submitHoneypot))
    const result = await createClient().submit('posts', 'hello-world', { author: { name: 'Bot' }, body: 'buy', honeypot: 'filled' })
    expect(result).toEqual({ success: true, status: 'pending' })
    expect(result.comment).toBeUndefined()
  })

  it('submit() resolves with field errors on a 200 verdict', async () => {
    const fetchMock = mockFetch(submitErrors)
    vi.stubGlobal('fetch', fetchMock)
    const result = await createClient().submit('posts', 'hello-world', { ...invalidRequest, honeypot: invalidRequest._hp })
    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(sent).toEqual({ ...invalidRequest, parentId: null })
    expect(result.success).toBe(false)
    // Dictionary text, not a key — branch on `field`.
    expect(result.errors).toEqual([{ field: 'author.email', message: 'An email address is required' }])
  })

  it('submit() rejects on a closed thread (403) with the dictionary message', async () => {
    const closed = errors.comments.find((e) => e.key === 'comments.thread_closed')!
    vi.stubGlobal('fetch', mockFetch({ url: '/api/comments/v1/proj1/posts/e1', statusCode: 403, statusMessage: 'Server Error', message: closed.message }, 403))
    const err = await createClient().submit('posts', 'e1', { author: { name: 'Ada' }, body: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ContentrainError)
    expect((err as ContentrainError).status).toBe(403)
    expect((err as ContentrainError).message).toBe('Comments are closed for this entry')
  })
})
