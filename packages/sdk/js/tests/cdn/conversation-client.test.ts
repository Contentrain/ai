import { describe, it, expect, vi, afterEach } from 'vitest'
import { ConversationClient } from '../../src/cdn/conversation-client.js'
import { ContentrainError } from '../../src/cdn/errors.js'

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

function createClient() {
  return new ConversationClient({
    baseUrl: 'https://studio.test/api/conversation/v1',
    projectId: 'proj1',
    apiKey: 'crn_conv_testkey123',
  })
}

describe('ConversationClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  // ─── send() ───

  it('send() posts message and returns response', async () => {
    const response = {
      conversationId: 'conv-1',
      message: 'I created a new blog post.',
      toolResults: [{ id: 't-1', name: 'save_content', result: { success: true } }],
      usage: { inputTokens: 150, outputTokens: 80 },
    }
    const fetchMock = mockFetch(response)
    vi.stubGlobal('fetch', fetchMock)

    const client = createClient()
    const result = await client.send('Create a blog post about Vue')

    expect(result.conversationId).toBe('conv-1')
    expect(result.message).toBe('I created a new blog post.')
    expect(result.toolResults).toHaveLength(1)
    expect(result.usage.inputTokens).toBe(150)
  })

  it('send() sends correct URL, method, headers and body', async () => {
    const fetchMock = mockFetch({ conversationId: 'c-1', message: 'OK', usage: { inputTokens: 0, outputTokens: 0 } })
    vi.stubGlobal('fetch', fetchMock)

    const client = createClient()
    await client.send('Hello')

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://studio.test/api/conversation/v1/proj1/message')
    expect(opts.method).toBe('POST')
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer crn_conv_testkey123')
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json')

    const body = JSON.parse(opts.body as string)
    expect(body.message).toBe('Hello')
  })

  it('send() includes conversationId when continuing', async () => {
    const fetchMock = mockFetch({ conversationId: 'conv-2', message: 'Done', usage: { inputTokens: 0, outputTokens: 0 } })
    vi.stubGlobal('fetch', fetchMock)

    const client = createClient()
    await client.send('Follow up', { conversationId: 'conv-2' })

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.conversationId).toBe('conv-2')
  })

  it('send() includes context when provided', async () => {
    const fetchMock = mockFetch({ conversationId: 'c-1', message: 'OK', usage: { inputTokens: 0, outputTokens: 0 } })
    vi.stubGlobal('fetch', fetchMock)

    const client = createClient()
    await client.send('Edit hero', {
      context: { activeModelId: 'hero', activeLocale: 'en' },
    })

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.context.activeModelId).toBe('hero')
    expect(body.context.activeLocale).toBe('en')
  })

  it('send() throws ContentrainError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch('Unauthorized', 401))
    const client = createClient()
    await expect(client.send('Hello')).rejects.toThrow(ContentrainError)
  })

  it('send() throws ContentrainError on 429 (rate limit)', async () => {
    vi.stubGlobal('fetch', mockFetch('Rate limit exceeded', 429))
    const client = createClient()
    await expect(client.send('Hello')).rejects.toThrow(ContentrainError)
  })

  // ─── history() ───

  it('history() fetches conversation messages', async () => {
    const historyData = {
      conversationId: 'conv-1',
      messages: [
        { id: 'm-1', role: 'user', content: 'Hello', createdAt: '2026-04-10T12:00:00Z' },
        { id: 'm-2', role: 'assistant', content: 'Hi! How can I help?', createdAt: '2026-04-10T12:00:01Z' },
      ],
    }
    const fetchMock = mockFetch(historyData)
    vi.stubGlobal('fetch', fetchMock)

    const client = createClient()
    const result = await client.history('conv-1')

    expect(result.conversationId).toBe('conv-1')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0]!.role).toBe('user')
    expect(result.messages[1]!.role).toBe('assistant')
  })

  it('history() sends correct URL with query params', async () => {
    const fetchMock = mockFetch({ conversationId: 'c-1', messages: [] })
    vi.stubGlobal('fetch', fetchMock)

    const client = createClient()
    await client.history('conv-1', { limit: 20 })

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('conversationId=conv-1')
    expect(url).toContain('limit=20')
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer crn_conv_testkey123')
  })

  it('history() throws ContentrainError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch('Not Found', 404))
    const client = createClient()
    await expect(client.history('nonexistent')).rejects.toThrow(ContentrainError)
  })
})
