import { describe, it, expect, vi, afterEach } from 'vitest'
import { FormsClient } from '../../src/cdn/forms-client.js'
import { ContentrainError } from '../../src/cdn/errors.js'

const sampleConfig = {
  modelId: 'contact',
  fields: [
    { id: 'name', type: 'string', required: true, label: 'Name' },
    { id: 'email', type: 'email', required: true, label: 'Email' },
    { id: 'message', type: 'rich-text', required: false, label: 'Message' },
  ],
  captchaType: 'turnstile' as const,
  successMessage: 'Thank you!',
  honeypotField: '_hp_field',
}

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
  return new FormsClient({
    baseUrl: 'https://studio.test/api/forms/v1',
    projectId: 'proj1',
    apiKey: 'crn_live_testkey',
  })
}

describe('FormsClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('config() fetches form configuration', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleConfig))
    const client = createClient()
    const config = await client.config('contact')
    expect(config.modelId).toBe('contact')
    expect(config.fields).toHaveLength(3)
    expect(config.captchaType).toBe('turnstile')
  })

  it('config() sends auth header when apiKey provided', async () => {
    const fetchMock = mockFetch(sampleConfig)
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient()
    await client.config('contact')
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://studio.test/api/forms/v1/proj1/contact/config')
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer crn_live_testkey')
  })

  it('config() works without apiKey', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleConfig))
    const client = new FormsClient({
      baseUrl: 'https://studio.test/api/forms/v1',
      projectId: 'proj1',
    })
    const config = await client.config('contact')
    expect(config.modelId).toBe('contact')
  })

  it('config() throws ContentrainError on failure', async () => {
    vi.stubGlobal('fetch', mockFetch('Not Found', 404))
    const client = createClient()
    await expect(client.config('nonexistent')).rejects.toThrow(ContentrainError)
  })

  it('submit() sends form data', async () => {
    const successResult = { success: true, message: 'Thank you!' }
    const fetchMock = mockFetch(successResult)
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient()
    const result = await client.submit('contact', {
      name: 'Alice',
      email: 'alice@example.com',
      message: 'Hello!',
    })
    expect(result.success).toBe(true)
    expect(result.message).toBe('Thank you!')

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://studio.test/api/forms/v1/proj1/contact/submit')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body.name).toBe('Alice')
    expect(body.email).toBe('alice@example.com')
  })

  it('submit() includes captcha token when provided', async () => {
    const fetchMock = mockFetch({ success: true })
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient()
    await client.submit('contact', { name: 'Bob' }, { captchaToken: 'tok_123' })
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body['cf-turnstile-response']).toBe('tok_123')
  })

  it('submit() returns validation errors', async () => {
    const errorResult = {
      success: false,
      errors: [
        { field: 'email', message: 'Invalid email format' },
        { field: 'name', message: 'Name is required' },
      ],
    }
    vi.stubGlobal('fetch', mockFetch(errorResult, 422))
    const client = createClient()
    const result = await client.submit('contact', { email: 'invalid' })
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors![0]!.field).toBe('email')
  })

  it('submit() throws on server error without error details', async () => {
    vi.stubGlobal('fetch', mockFetch({ success: false, message: 'Internal error' }, 500))
    const client = createClient()
    await expect(client.submit('contact', {})).rejects.toThrow(ContentrainError)
  })
})
