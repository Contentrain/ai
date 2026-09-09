import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMBED_TS } from './index'

// The embed runtime ships as source text; this suite writes it to disk and
// imports it, so the functions under test are the ones the generated site
// runs. Requests and responses are checked against the SAME fixtures the SDK's
// FormsClient/CommentsClient tests use (Studio's docs/FORMS.md and
// docs/COMMENTS.md examples): one server contract, two clients, one truth.

const HERE = dirname(fileURLToPath(import.meta.url))
const TMP = join(HERE, '..', '.vitest-tmp-embed')
const FIXTURES = join(HERE, '..', '..', 'sdk', 'js', 'tests', 'fixtures', 'public-api')

const fixture = async (name: string): Promise<any> => JSON.parse(await readFile(join(FIXTURES, `${name}.json`), 'utf8'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Embed = Record<string, any>
let em: Embed
const rt = { base_url: 'https://studio.test/', project_id: 'proj1' }
const entry = { model_id: 'posts', entry_id: 'a1b2c3d4e5f6', locale: 'en' }

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  })
}

beforeAll(async () => {
  await mkdir(TMP, { recursive: true })
  await writeFile(join(TMP, 'embed.ts'), EMBED_TS, 'utf8')
  em = (await import(/* @vite-ignore */ join(TMP, 'embed.ts'))) as Embed
})

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('emitted embed runtime — transport', () => {
  it('builds public URLs from the runtime origin, encoding segments and dropping empty query values', () => {
    expect(em.formsRoot(rt)).toBe('https://studio.test/api/forms/v1')
    expect(em.commentsRoot(rt)).toBe('https://studio.test/api/comments/v1')
    expect(em.publicUrl(em.commentsRoot(rt), ['proj1', 'posts', 'e 1'], { locale: 'en', page: undefined, sort: '' })).toBe(
      'https://studio.test/api/comments/v1/proj1/posts/e%201?locale=en',
    )
  })

  it('sends no credential and turns h3 errors into EmbedError with the status', async () => {
    const fetchMock = mockFetch(await fixture('h3-error'), 429)
    vi.stubGlobal('fetch', fetchMock)
    const err = await em.submitForm(rt, 'contact', { data: {} }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(em.EmbedError)
    expect(err.status).toBe(429)
    expect(err.message).toBe('forms.rate_limited')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.stringify(init.headers)).not.toContain('Authorization')
  })
})

describe('emitted embed runtime — forms', () => {
  it('fetches the config from the documented URL', async () => {
    const config = await fixture('form-config')
    const fetchMock = mockFetch(config)
    vi.stubGlobal('fetch', fetchMock)
    expect(await em.fetchFormConfig(rt, 'contact')).toEqual(config)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://studio.test/api/forms/v1/proj1/contact/config')
  })

  it('formPayload builds the documented request body from form entries', async () => {
    const config = await fixture('form-config')
    const entries: Array<[string, unknown]> = [
      ['name', 'Ada'],
      ['email', 'ada@example.com'],
      ['message', 'Hello'],
      ['_hp', ''],
      ['cf-turnstile-response', 'turnstile-token'],
      ['not_exposed', 'dropped'],
      ['upload', new Blob(['x'])],
    ]
    expect(em.formPayload(entries, config)).toEqual(await fixture('form-submit-request'))
  })

  it('formPayload coerces by field type and omits control fields it did not see', () => {
    const config = { fields: { age: { type: 'integer' }, ok: { type: 'boolean' }, note: { type: 'string' } }, honeypotField: null }
    expect(em.formPayload([['age', '42'], ['ok', 'on'], ['note', 'x']], config)).toEqual({ data: { age: 42, ok: true, note: 'x' } })
    expect(em.formPayload([['cf-turnstile-response', '']], config)).toEqual({ data: {} })
  })

  it('submitForm posts JSON to the documented URL and returns the verdict as-is', async () => {
    const request = await fixture('form-submit-request')
    const errors = await fixture('form-submit-errors')
    const fetchMock = mockFetch(errors)
    vi.stubGlobal('fetch', fetchMock)
    expect(await em.submitForm(rt, 'contact', request)).toEqual(errors)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://studio.test/api/forms/v1/proj1/contact/submit')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual(request)
  })

  it('formHtml renders one control per exposed field by type, the honeypot, the captcha and a submit', async () => {
    const html: string = em.formHtml(await fixture('form-config'))
    expect(html).toContain('<form class="cr-form" method="post" data-model="contact">')
    expect(html).toContain('<input type="text" id="cr-field-name" name="name" required />')
    expect(html).toContain('<input type="email" id="cr-field-email" name="email" required />')
    expect(html).toContain('<textarea id="cr-field-message" name="message" rows="5"></textarea>')
    expect(html).toContain('<label for="cr-field-name">Name <span aria-hidden="true">*</span></label>')
    expect(html).toContain('name="_hp" tabindex="-1" autocomplete="off"')
    expect(html).toContain('<div class="cf-turnstile" data-sitekey="0x4AAAAAAAExampleSiteKey"></div>')
    expect(html).toContain('<button type="submit">Send</button>')
    expect(html).toContain('<div class="cr-status" aria-live="polite"></div>')
  })

  it('fieldControl maps every field type to a control and escapes attribute values', () => {
    expect(em.fieldControl('n', { type: 'number', min: 1, max: 5 })).toBe('<input type="number" id="cr-field-n" name="n" min="1" max="5" />')
    expect(em.fieldControl('n', { type: 'integer' })).toContain('step="1"')
    expect(em.fieldControl('n', { type: 'decimal' })).toContain('step="any"')
    expect(em.fieldControl('b', { type: 'boolean' })).toBe('<input type="checkbox" id="cr-field-b" name="b" />')
    expect(em.fieldControl('s', { type: 'select', options: ['a', 'b"c'] })).toBe(
      '<select id="cr-field-s" name="s"><option value=""></option><option value="a">a</option><option value="b&quot;c">b&quot;c</option></select>',
    )
    expect(em.fieldControl('s', { type: 'select', required: true, options: ['a'] })).not.toContain('<option value=""></option>')
    expect(em.fieldControl('d', { type: 'date' })).toContain('type="date"')
    expect(em.fieldControl('d', { type: 'datetime' })).toContain('type="datetime-local"')
    expect(em.fieldControl('u', { type: 'url' })).toContain('type="url"')
    expect(em.fieldControl('p', { type: 'phone' })).toContain('type="tel"')
    expect(em.fieldControl('c', { type: 'color' })).toContain('type="color"')
    expect(em.fieldControl('t', { type: 'richtext', max: 500 })).toBe('<textarea id="cr-field-t" name="t" maxlength="500" rows="5"></textarea>')
    expect(em.fieldControl('x', { type: 'string', pattern: 'a"b' })).toContain('pattern="a&quot;b"')
    expect(em.fieldControl('x', { type: 'image' })).toContain('type="text"')
  })

  it('no honeypot or captcha markup when the config has none', () => {
    expect(em.honeypotHtml(null)).toBe('')
    expect(em.captchaHtml(null, null)).toBe('')
    expect(em.captchaHtml('turnstile', null)).toBe('')
    expect(em.labelFor('first_name', {})).toBe('First name')
    expect(em.labelFor('x', { label: 'Given' })).toBe('Given')
  })
})

describe('emitted embed runtime — comments', () => {
  it('fetchThread reads the documented URL with the entry locale', async () => {
    const thread = await fixture('comment-thread')
    const fetchMock = mockFetch(thread)
    vi.stubGlobal('fetch', fetchMock)
    expect(await em.fetchThread(rt, entry, { page: 2, sort: 'newest' })).toEqual(thread)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://studio.test/api/comments/v1/proj1/posts/a1b2c3d4e5f6?locale=en&page=2&sort=newest')
  })

  it('commentPayload builds the documented request body from the comment form', async () => {
    const entries: Array<[string, unknown]> = [
      ['parent_id', '11111111-1111-4111-8111-111111111111'],
      ['body', ' Great post '],
      ['author_name', 'Ada'],
      ['author_email', 'ada@example.com'],
      ['author_url', 'https://ada.dev'],
      ['_hp', ''],
      ['cf-turnstile-response', 'turnstile-token'],
    ]
    expect(em.commentPayload(entries, '_hp')).toEqual(await fixture('comment-submit-request'))
    expect(em.commentPayload([['author_name', 'A'], ['body', 'b'], ['parent_id', ''], ['author_email', ' ']], null)).toEqual({
      author: { name: 'A' },
      body: 'b',
    })
  })

  it('submitComment posts to the documented URL and returns the verdict', async () => {
    const request = await fixture('comment-submit-request')
    const pending = await fixture('comment-submit-pending')
    const fetchMock = mockFetch(pending)
    vi.stubGlobal('fetch', fetchMock)
    expect(await em.submitComment(rt, entry, request)).toEqual(pending)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://studio.test/api/comments/v1/proj1/posts/a1b2c3d4e5f6?locale=en')
    expect(JSON.parse(init.body as string)).toEqual(request)
  })

  it('threadHtml renders roots with nested replies, escaped bodies, moderator badge and reply buttons within depth', async () => {
    const thread = await fixture('comment-thread')
    const html: string = em.threadHtml(thread)
    expect(html).toContain('<ol class="cr-comment-list">')
    expect(html).toContain('id="cr-comment-11111111-1111-4111-8111-111111111111"')
    expect(html).toContain('<p>First &lt;b&gt;comment&lt;/b&gt; &amp; more</p>')
    expect(html).not.toContain('<b>comment</b>')
    expect(html).toContain('<a href="https://ada.dev/" rel="nofollow ugc noopener" target="_blank">Ada</a>')
    expect(html).toContain('<ol class="cr-replies"><li class="cr-comment cr-comment--comment" id="cr-comment-22222222-2222-4222-8222-222222222222" data-depth="1">')
    expect(html).toContain('<span class="cr-moderator">Moderator</span>')
    expect(html).toContain('<time datetime="2020-05-01T10:00:00.000Z">2020-05-01</time>')
    expect(html).toContain('class="cr-reply" data-parent="11111111-1111-4111-8111-111111111111" data-author="Ada"')
  })

  it('reply buttons disappear on a closed thread and at the depth cap', async () => {
    const thread = await fixture('comment-thread')
    expect(em.threadHtml({ ...thread, config: { ...thread.config, closed: true } })).not.toContain('cr-reply')
    expect(em.threadHtml({ ...thread, config: { ...thread.config, maxDepth: 1 } })).toContain('data-parent="11111111-1111-4111-8111-111111111111"')
    expect(em.threadHtml({ ...thread, config: { ...thread.config, maxDepth: 1 } })).not.toContain('data-parent="22222222-2222-4222-8222-222222222222"')
    expect(em.threadHtml({ ...thread, comments: [] })).toBe('<p class="cr-empty">No comments yet.</p>')
    expect(em.hasMore({ ...thread, total: 41, page: 2, limit: 20 })).toBe(true)
    expect(em.hasMore({ ...thread, total: 40, page: 2, limit: 20 })).toBe(false)
  })

  it('commentFormHtml follows the thread config: required email, body cap, honeypot, captcha', async () => {
    const thread = await fixture('comment-thread')
    const html: string = em.commentFormHtml(thread.config)
    expect(html).toContain('<input type="hidden" name="parent_id" value="" />')
    expect(html).toContain('name="body" required maxlength="5000"')
    expect(html).toContain('name="author_name" required maxlength="120"')
    expect(html).toContain('name="author_email" required maxlength="254"')
    expect(html).toContain('name="_hp"')
    expect(html).not.toContain('cf-turnstile')
    const optionalEmail: string = em.commentFormHtml({ ...thread.config, requireEmail: false, captcha: 'turnstile', captchaSiteKey: 'k', honeypotField: null })
    expect(optionalEmail).toContain('name="author_email" maxlength="254"')
    expect(optionalEmail).toContain('data-sitekey="k"')
    expect(optionalEmail).not.toContain('name="_hp"')
  })

  it('bodyHtml turns plain text into escaped paragraphs and line breaks', () => {
    expect(em.bodyHtml('a <b>\nb\n\nc')).toBe('<p>a &lt;b&gt;<br />b</p><p>c</p>')
  })
})
