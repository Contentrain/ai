import { describe, it, expect, vi, afterEach } from 'vitest'
import { CommentsClient } from '../../src/cdn/comments-client.js'
import { ContentrainError } from '../../src/cdn/errors.js'
import thread from '../fixtures/public-api/comment-thread.json'
import submitRequest from '../fixtures/public-api/comment-submit-request.json'
import submitPending from '../fixtures/public-api/comment-submit-pending.json'
import submitErrors from '../fixtures/public-api/comment-submit-errors.json'

// Fixtures mirror Studio's docs/COMMENTS.md — the server contract.

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
    const result = await createClient().thread('posts', 'a1b2c3d4e5f6', { locale: 'en', page: 1, limit: 20, sort: 'oldest' })

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit | undefined]
    expect(url).toBe('https://studio.test/api/comments/v1/proj1/posts/a1b2c3d4e5f6?locale=en&page=1&limit=20&sort=oldest')
    expect(opts).toBeUndefined()

    expect(result.entry).toEqual({ modelId: 'posts', entryId: 'a1b2c3d4e5f6', locale: 'en' })
    expect(result.config).toMatchObject({ closed: false, maxDepth: 4, captcha: null, honeypotField: '_hp' })
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

  it('submit() posts the documented body with the locale on the query string', async () => {
    const fetchMock = mockFetch(submitPending)
    vi.stubGlobal('fetch', fetchMock)
    const result = await createClient().submit(
      'posts',
      'a1b2c3d4e5f6',
      {
        author: { name: 'Ada', email: 'ada@example.com', url: 'https://ada.dev' },
        body: 'Great post',
        parentId: '11111111-1111-4111-8111-111111111111',
        captchaToken: 'turnstile-token',
        honeypot: '',
      },
      { locale: 'en' },
    )
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://studio.test/api/comments/v1/proj1/posts/a1b2c3d4e5f6?locale=en')
    expect(opts.method).toBe('POST')
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(Object.keys(opts.headers as object).map((h) => h.toLowerCase())).not.toContain('authorization')
    expect(JSON.parse(opts.body as string)).toEqual(submitRequest)

    expect(result.success).toBe(true)
    expect(result.status).toBe('pending')
    expect(result.comment!.id).toBe('33333333-3333-4333-8333-333333333333')
  })

  it('submit() omits optional fields it was not given', async () => {
    const fetchMock = mockFetch({ success: true, status: 'pending' })
    vi.stubGlobal('fetch', fetchMock)
    await createClient().submit('posts', 'e1', { author: { name: 'Ada' }, body: 'Hi' })
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      author: { name: 'Ada' },
      body: 'Hi',
    })
  })

  it('submit() resolves with field errors on a 200 verdict', async () => {
    vi.stubGlobal('fetch', mockFetch(submitErrors))
    const result = await createClient().submit('posts', 'e1', { author: { name: '' }, body: 'x' })
    expect(result.success).toBe(false)
    expect(result.errors).toEqual([{ field: 'author.name', message: 'comments.author_required' }])
  })

  it('submit() rejects on a closed thread (403) with the server message', async () => {
    vi.stubGlobal('fetch', mockFetch({ statusCode: 403, message: 'comments.thread_closed' }, 403))
    const err = await createClient().submit('posts', 'e1', { author: { name: 'Ada' }, body: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ContentrainError)
    expect((err as ContentrainError).status).toBe(403)
    expect((err as ContentrainError).message).toBe('comments.thread_closed')
  })
})
