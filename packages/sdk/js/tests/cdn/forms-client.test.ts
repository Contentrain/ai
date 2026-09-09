import { describe, it, expect, vi, afterEach } from 'vitest'
import { FormsClient } from '../../src/cdn/forms-client.js'
import { ContentrainError } from '../../src/cdn/errors.js'
import formConfig from '../fixtures/public-api/form-config.json'
import submitRequest from '../fixtures/public-api/form-submit-request.json'
import submitSuccess from '../fixtures/public-api/form-submit-success.json'
import submitErrors from '../fixtures/public-api/form-submit-errors.json'
import h3Error from '../fixtures/public-api/h3-error.json'

// The fixtures are the request/response examples of Studio's docs/FORMS.md —
// the server contract this client consumes. A change on either side must
// change these files, never the client alone.

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
  return new FormsClient({ baseUrl: 'https://studio.test/api/forms/v1/', projectId: 'proj1' })
}

describe('FormsClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('config() fetches the public config: fields as a map, captcha + site key, honeypot name', async () => {
    const fetchMock = mockFetch(formConfig)
    vi.stubGlobal('fetch', fetchMock)
    const config = await createClient().config('contact')

    expect(config.modelId).toBe('contact')
    expect(config.locale).toBe('en')
    expect(Object.keys(config.fields)).toEqual(['name', 'email', 'message'])
    expect(config.fields.email!.type).toBe('email')
    expect(config.fields.email!.required).toBe(true)
    expect(config.captcha).toBe('turnstile')
    expect(config.captchaSiteKey).toBe('0x4AAAAAAAExampleSiteKey')
    expect(config.honeypotField).toBe('_hp')
    expect(config.successMessage).toBe('Thank you!')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://studio.test/api/forms/v1/proj1/contact/config')
  })

  it('never sends a credential — the public CORS allows only Content-Type', async () => {
    const fetchMock = mockFetch(formConfig)
    vi.stubGlobal('fetch', fetchMock)
    await createClient().config('contact')
    await createClient().submit('contact', { name: 'Ada' })
    for (const call of fetchMock.mock.calls as Array<[string, RequestInit | undefined]>) {
      const headers = (call[1]?.headers ?? {}) as Record<string, string>
      expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('authorization')
    }
  })

  it('config() throws ContentrainError with the h3 message on failure', async () => {
    vi.stubGlobal('fetch', mockFetch({ statusCode: 404, message: 'forms.form_disabled' }, 404))
    await expect(createClient().config('contact')).rejects.toMatchObject({
      name: 'ContentrainError',
      status: 404,
      message: 'forms.form_disabled',
    })
  })

  it('submit() wraps the values in `data` and sends captchaToken and _hp beside it', async () => {
    const fetchMock = mockFetch(submitSuccess)
    vi.stubGlobal('fetch', fetchMock)
    const result = await createClient().submit(
      'contact',
      { name: 'Ada', email: 'ada@example.com', message: 'Hello' },
      { captchaToken: 'turnstile-token', honeypot: '' },
    )
    expect(result).toEqual({ success: true, message: 'Thank you!' })

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://studio.test/api/forms/v1/proj1/contact/submit')
    expect(opts.method).toBe('POST')
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    // Byte-for-byte the documented request body.
    expect(JSON.parse(opts.body as string)).toEqual(submitRequest)
  })

  it('submit() omits captchaToken and _hp when not given, and never flattens data', async () => {
    const fetchMock = mockFetch(submitSuccess)
    vi.stubGlobal('fetch', fetchMock)
    await createClient().submit('contact', { name: 'Ada', captchaToken: 'not-a-control-field' })
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body).toEqual({ data: { name: 'Ada', captchaToken: 'not-a-control-field' } })
    expect(body).not.toHaveProperty('captchaToken')
    expect(body).not.toHaveProperty('_hp')
    expect(body).not.toHaveProperty('cf-turnstile-response')
  })

  it('submit() resolves with validation errors — a 200 with success:false is a verdict, not a failure', async () => {
    vi.stubGlobal('fetch', mockFetch(submitErrors))
    const result = await createClient().submit('contact', { email: 'invalid' })
    expect(result.success).toBe(false)
    expect(result.errors).toEqual([
      { field: 'email', message: 'validation.invalid_email' },
      { field: 'name', message: 'validation.required' },
    ])
  })

  it('submit() rejects with the HTTP status and message on 429 / 403 / 404', async () => {
    vi.stubGlobal('fetch', mockFetch(h3Error, 429))
    const err = await createClient().submit('contact', { name: 'Ada' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ContentrainError)
    expect((err as ContentrainError).status).toBe(429)
    expect((err as ContentrainError).message).toBe('forms.rate_limited')
  })

  it('submit() keeps a non-JSON error body as the message', async () => {
    vi.stubGlobal('fetch', mockFetch('Bad Gateway', 502))
    await expect(createClient().submit('contact', {})).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' })
  })

  it('encodes path segments', async () => {
    const fetchMock = mockFetch(formConfig)
    vi.stubGlobal('fetch', fetchMock)
    await createClient().config('contact form')
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://studio.test/api/forms/v1/proj1/contact%20form/config')
  })
})
