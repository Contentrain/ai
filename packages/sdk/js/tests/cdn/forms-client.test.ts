import { describe, it, expect, vi, afterEach } from 'vitest'
import { FormsClient } from '../../src/cdn/forms-client.js'
import { ContentrainError } from '../../src/cdn/errors.js'
import formConfig from '../fixtures/public-api/forms.config.response.json'
import submitRequest from '../fixtures/public-api/forms.submit.request.json'
import submitSuccess from '../fixtures/public-api/forms.submit.success.response.json'
import invalidRequest from '../fixtures/public-api/forms.submit.invalid.request.json'
import submitErrors from '../fixtures/public-api/forms.submit.validation-error.response.json'
import captchaError from '../fixtures/public-api/forms.submit.captcha-error.response.json'
import errors from '../fixtures/public-api/errors.json'

// The fixtures are byte-for-byte copies of Studio's public-API wire fixtures
// (tests/fixtures/public-api, produced by the real route handlers) — the
// server contract this client consumes. See ../fixtures/public-api/README.md.

const rateLimited = errors.forms.find((e) => e.key === 'forms.rate_limited')!

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
    expect(config.captchaSiteKey).toBe('0x4AAAAAAA-fixture-site-key')
    expect(config.honeypotField).toBe('_hp')
    expect(config.successMessage).toBe('Thanks! We will get back to you.')

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
    const disabled = errors.forms.find((e) => e.key === 'forms.form_disabled')!
    vi.stubGlobal('fetch', mockFetch({ url: '/api/forms/v1/proj1/contact/config', statusCode: 404, statusMessage: 'Server Error', message: disabled.message }, 404))
    await expect(createClient().config('contact')).rejects.toMatchObject({
      name: 'ContentrainError',
      status: 404,
      message: 'This form is not currently accepting submissions.',
    })
  })

  it('submit() wraps the values in `data` and sends captchaToken and _hp beside it', async () => {
    const fetchMock = mockFetch(submitSuccess)
    vi.stubGlobal('fetch', fetchMock)
    const result = await createClient().submit(
      'contact',
      { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello from the migrated site.' },
      { captchaToken: '0.turnstile-token-from-the-widget', honeypot: '' },
    )
    expect(result).toEqual({ success: true, message: 'Thanks! We will get back to you.' })

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
    const fetchMock = mockFetch(submitErrors)
    vi.stubGlobal('fetch', fetchMock)
    const result = await createClient().submit('contact', invalidRequest.data, { captchaToken: invalidRequest.captchaToken, honeypot: invalidRequest._hp })
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual(invalidRequest)
    expect(result.success).toBe(false)
    // Messages are the validator's free text — branch on `field`, never on `message`.
    expect(result.errors!.map((e) => e.field)).toEqual(['name', 'email'])
    expect(result.errors).toEqual(submitErrors.errors)
  })

  it('a missing or rejected captcha is a 200 verdict on the `captcha` field, not a 4xx', async () => {
    vi.stubGlobal('fetch', mockFetch(captchaError))
    const result = await createClient().submit('contact', { name: 'Ada Lovelace' })
    expect(result.success).toBe(false)
    expect(result.errors![0]!.field).toBe('captcha')
  })

  it('submit() rejects with the HTTP status and the dictionary message on 429 / 403 / 404', async () => {
    // Nitro's production error body: statusMessage is a generic "Server Error"; the dictionary text is in `message`.
    vi.stubGlobal('fetch', mockFetch({ url: '/api/forms/v1/proj1/contact/submit', statusCode: 429, statusMessage: 'Server Error', message: rateLimited.message }, 429))
    const err = await createClient().submit('contact', { name: 'Ada' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ContentrainError)
    expect((err as ContentrainError).status).toBe(429)
    expect((err as ContentrainError).message).toBe('Too many submissions. Please try again later.')
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
